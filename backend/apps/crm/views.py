from datetime import timedelta

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User

from .analytics import get_analytics, invalidate_analytics_cache, parse_date_range
from .automation import assign_lead_via_routing, create_notification, ensure_default_routing_rule
from .filters import LeadFilter, OpportunityFilter
from .models import (
    Account,
    Activity,
    Contact,
    DealComment,
    EmailTemplate,
    JobRun,
    Lead,
    LeadRoutingRule,
    Notification,
    Opportunity,
    Sequence,
    SequenceEnrollment,
    Task,
)
from .permissions import IsManager, IsSDRorManager, RoleScopedAccess
from .serializers import (
    AccountSerializer,
    ActivitySerializer,
    ContactSerializer,
    DealCommentSerializer,
    EmailTemplateSerializer,
    JobRunSerializer,
    LeadConvertSerializer,
    LeadRoutingRuleSerializer,
    LeadSerializer,
    NotificationSerializer,
    OpportunityListSerializer,
    OpportunitySerializer,
    SequenceEnrollmentSerializer,
    SequenceSerializer,
    SequenceStepSerializer,
    TaskSerializer,
)
from .services import build_forecast_payload, get_dashboard_for_user
from .tasks import (
    advance_sequence_enrollments,
    enqueue_notification,
    export_analytics_csv,
    export_forecast_csv,
    flag_stale_deals,
    import_leads_csv,
    reset_demo_data,
    warm_dashboard_cache,
)


def _bust_user_caches(user_id: int | None):
    if not user_id:
        return
    cache.delete(f"dashboard:user:{user_id}")
    invalidate_analytics_cache(user_id)


def _owned_queryset(qs, user, owner_field="owner"):
    if user.role == User.Role.MANAGER:
        return qs
    return qs.filter(**{owner_field: user})


class LeadViewSet(viewsets.ModelViewSet):
    serializer_class = LeadSerializer
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = LeadFilter
    search_fields = ["name", "email", "company"]
    ordering_fields = ["created_at", "company", "status"]

    def get_queryset(self):
        return _owned_queryset(Lead.objects.select_related("owner"), self.request.user)

    def perform_create(self, serializer):
        explicit_owner = "owner" in serializer.validated_data
        lead = serializer.save(owner=serializer.validated_data.get("owner", self.request.user))
        owner_before = lead.owner_id
        lead = assign_lead_via_routing(lead, explicit_owner=explicit_owner)
        routed = lead.owner_id != owner_before
        enqueue_notification(
            "New lead assigned",
            f"Lead {lead.name} ({lead.company}) was created/assigned to you.",
            lead.owner.email,
        )
        # Routing already creates an in-app notification when it reassigns.
        if not routed and lead.owner_id != self.request.user.id:
            create_notification(
                user=lead.owner,
                title="New lead assigned",
                body=f"{lead.name} @ {lead.company} was assigned to you.",
                kind=Notification.Kind.ASSIGNMENT,
                link="/leads",
            )
        cache.delete(f"dashboard:user:{lead.owner_id}")

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request, pk=None):
        lead = self.get_object()
        serializer = LeadConvertSerializer(
            data=request.data,
            context={"request": request, "lead": lead},
        )
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        enqueue_notification(
            "Lead converted",
            f"Lead {lead.name} converted to opportunity {result['opportunity'].name}.",
            result["opportunity"].owner.email,
        )
        create_notification(
            user=result["opportunity"].owner,
            title="Lead converted",
            body=f"{lead.name} → deal {result['opportunity'].name}",
            kind=Notification.Kind.STAGE,
            link=f"/opportunities/{result['opportunity'].id}",
        )
        cache.delete(f"dashboard:user:{request.user.id}")
        return Response(
            {
                "lead": LeadSerializer(result["lead"]).data,
                "account": AccountSerializer(result["account"]).data,
                "contact": ContactSerializer(result["contact"]).data,
                "opportunity": OpportunityListSerializer(result["opportunity"]).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="import-csv",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
        permission_classes=[IsAuthenticated, IsSDRorManager],
    )
    def import_csv(self, request):
        """
        Accepts multipart file `file` OR JSON `{ "csv_text": "..." }`.
        Enqueues Celery import so the HTTP response returns immediately with a JobRun.
        """
        csv_text = request.data.get("csv_text")
        upload = request.FILES.get("file")
        if upload and not csv_text:
            csv_text = upload.read().decode("utf-8")
        if not csv_text:
            return Response(
                {"detail": "Provide csv_text or file with headers: name,email,company,title,source"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        job = JobRun.objects.create(
            type=JobRun.Type.LEAD_IMPORT,
            status=JobRun.Status.PENDING,
            requested_by=request.user,
            message="Queued lead import",
        )
        async_result = import_leads_csv.delay(job.id, request.user.id, csv_text)
        job.celery_task_id = async_result.id or ""
        job.save(update_fields=["celery_task_id"])
        return Response(JobRunSerializer(job, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)


class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["industry", "owner"]
    search_fields = ["name", "domain"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return _owned_queryset(Account.objects.select_related("owner"), self.request.user)


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["account"]
    search_fields = ["name", "email", "title"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        qs = Contact.objects.select_related("account", "account__owner")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(account__owner=user)

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)


class OpportunityViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = OpportunityFilter
    search_fields = ["name", "account__name"]
    ordering_fields = ["amount", "close_date", "updated_at", "stage"]

    def get_queryset(self):
        return _owned_queryset(
            Opportunity.objects.select_related("owner", "account", "primary_contact").prefetch_related(
                "activities",
                "activities__created_by",
                "comments",
                "comments__author",
            ),
            self.request.user,
        )

    def get_serializer_class(self):
        if self.action == "list":
            return OpportunityListSerializer
        return OpportunitySerializer

    def perform_create(self, serializer):
        opp = serializer.save(owner=serializer.validated_data.get("owner", self.request.user))
        cache.delete(f"dashboard:user:{opp.owner_id}")

    def perform_update(self, serializer):
        previous_stage = serializer.instance.stage
        opp = serializer.save()
        if previous_stage != opp.stage:
            enqueue_notification(
                "Opportunity stage changed",
                f"{opp.name} moved {previous_stage} → {opp.stage}",
                opp.owner.email,
            )
            create_notification(
                user=opp.owner,
                title="Stage changed",
                body=f"{opp.name}: {previous_stage} → {opp.stage}",
                kind=Notification.Kind.STAGE,
                link=f"/opportunities/{opp.id}",
            )
            if opp.is_stale:
                Opportunity.objects.filter(pk=opp.pk).update(is_stale=False)
                opp.is_stale = False
            if opp.stage in {Opportunity.Stage.CLOSED_WON, Opportunity.Stage.CLOSED_LOST} and not opp.closed_at:
                now = timezone.now()
                Opportunity.objects.filter(pk=opp.pk, closed_at__isnull=True).update(closed_at=now)
                opp.closed_at = now
        _bust_user_caches(opp.owner_id)

    @action(detail=False, methods=["get"], url_path="pipeline")
    def pipeline(self, request):
        qs = self.filter_queryset(self.get_queryset()).filter(
            stage__in=[
                Opportunity.Stage.DISCOVERY,
                Opportunity.Stage.DEMO,
                Opportunity.Stage.PROPOSAL,
                Opportunity.Stage.NEGOTIATION,
            ]
        )
        data = OpportunityListSerializer(qs, many=True).data
        columns = {
            stage: []
            for stage, _ in Opportunity.Stage.choices
            if stage
            not in {
                Opportunity.Stage.CLOSED_WON,
                Opportunity.Stage.CLOSED_LOST,
            }
        }
        for item in data:
            columns.setdefault(item["stage"], []).append(item)
        return Response({"columns": columns, "stages": list(columns.keys())})

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        opp = self.get_object()
        if request.method == "GET":
            qs = opp.comments.select_related("author")
            return Response(DealCommentSerializer(qs, many=True).data)
        serializer = DealCommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(opportunity=opp)
        return Response(DealCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"comments/(?P<comment_id>[^/.]+)")
    def delete_comment(self, request, pk=None, comment_id=None):
        opp = self.get_object()
        comment = DealComment.objects.filter(opportunity=opp, pk=comment_id).first()
        if comment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        user = request.user
        if user.role != User.Role.MANAGER and comment.author_id != user.id:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActivityViewSet(viewsets.ModelViewSet):
    serializer_class = ActivitySerializer
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["opportunity", "type", "completed"]
    search_fields = ["subject", "body"]
    ordering_fields = ["created_at", "due_at"]

    def get_queryset(self):
        qs = Activity.objects.select_related("opportunity", "created_by", "opportunity__owner")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(Q(created_by=user) | Q(opportunity__owner=user))

    def perform_create(self, serializer):
        activity = serializer.save(created_by=self.request.user)
        Opportunity.objects.filter(pk=activity.opportunity_id, is_stale=True).update(is_stale=False)
        cache.delete(f"dashboard:user:{self.request.user.id}")


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated, RoleScopedAccess]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["completed", "lead", "opportunity", "owner"]
    search_fields = ["title", "description"]
    ordering_fields = ["due_at", "created_at", "completed"]

    def get_queryset(self):
        qs = Task.objects.select_related("owner", "lead", "opportunity")
        user = self.request.user
        params = self.request.query_params
        if params.get("mine") in {"1", "true", "yes"}:
            qs = qs.filter(owner=user)
        elif user.role != User.Role.MANAGER:
            qs = qs.filter(owner=user)
        if params.get("overdue") in {"1", "true", "yes"}:
            qs = qs.filter(completed=False, due_at__lt=timezone.now())
        return qs


class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["is_read", "kind"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})

    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        ids = request.data.get("ids")
        qs = self.get_queryset().filter(is_read=False)
        if ids is not None:
            qs = qs.filter(id__in=ids)
        updated = qs.update(is_read=True, updated_at=timezone.now())
        return Response({"updated": updated})


class LeadRoutingRuleViewSet(viewsets.ModelViewSet):
    serializer_class = LeadRoutingRuleSerializer
    permission_classes = [IsAuthenticated, IsManager]
    http_method_names = ["get", "put", "patch", "head", "options", "post"]

    def get_queryset(self):
        ensure_default_routing_rule()
        return LeadRoutingRule.objects.select_related("last_assignee")


class EmailTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "subject"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return EmailTemplate.objects.select_related("created_by")


class SequenceViewSet(viewsets.ModelViewSet):
    serializer_class = SequenceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return Sequence.objects.select_related("created_by").prefetch_related("steps", "steps__template")

    @action(detail=True, methods=["post"], url_path="steps")
    def add_step(self, request, pk=None):
        sequence = self.get_object()
        data = {**request.data, "sequence": sequence.id}
        if "order" not in data:
            last = sequence.steps.order_by("-order").first()
            data["order"] = (last.order + 1) if last else 1
        serializer = SequenceStepSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SequenceSerializer(sequence).data, status=status.HTTP_201_CREATED)


class SequenceEnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = SequenceEnrollmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "sequence", "lead"]
    ordering_fields = ["created_at", "next_run_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = SequenceEnrollment.objects.select_related(
            "sequence", "lead", "lead__owner", "enrolled_by"
        )
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(Q(enrolled_by=user) | Q(lead__owner=user))

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        enrollment = self.get_object()
        enrollment.status = SequenceEnrollment.Status.CANCELLED
        enrollment.last_message = "Cancelled by user"
        enrollment.save(update_fields=["status", "last_message", "updated_at"])
        return Response(SequenceEnrollmentSerializer(enrollment).data)

    @action(
        detail=False,
        methods=["post"],
        url_path="advance-now",
        permission_classes=[IsAuthenticated, IsManager],
    )
    def advance_now(self, request):
        job = JobRun.objects.create(
            type=JobRun.Type.SEQUENCE_ADVANCE,
            status=JobRun.Status.PENDING,
            requested_by=request.user,
            message="Queued sequence advance",
        )
        async_result = advance_sequence_enrollments.delay(job.id)
        job.celery_task_id = async_result.id or ""
        job.save(update_fields=["celery_task_id"])
        return Response(JobRunSerializer(job, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)


class JobRunViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = JobRunSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["type", "status"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        qs = JobRun.objects.select_related("requested_by")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(requested_by=user)


class GlobalSearchView(APIView):
    """GET /api/search/?q= — role-scoped search across leads, accounts, contacts, opportunities."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response({"q": q, "results": []})

        user = request.user
        results: list[dict] = []

        leads = _owned_queryset(Lead.objects.select_related("owner"), user).filter(
            Q(name__icontains=q) | Q(email__icontains=q) | Q(company__icontains=q)
        )[:5]
        for lead in leads:
            results.append(
                {
                    "type": "lead",
                    "id": lead.id,
                    "label": lead.name,
                    "subtitle": f"{lead.company} · {lead.status}",
                    "href": "/leads",
                }
            )

        accounts = _owned_queryset(Account.objects.select_related("owner"), user).filter(
            Q(name__icontains=q) | Q(domain__icontains=q)
        )[:5]
        for account in accounts:
            results.append(
                {
                    "type": "account",
                    "id": account.id,
                    "label": account.name,
                    "subtitle": account.domain or account.industry or "Account",
                    "href": "/accounts",
                }
            )

        contacts_qs = Contact.objects.select_related("account", "account__owner").filter(
            Q(name__icontains=q) | Q(email__icontains=q) | Q(title__icontains=q)
        )
        if user.role != User.Role.MANAGER:
            contacts_qs = contacts_qs.filter(account__owner=user)
        for contact in contacts_qs[:5]:
            results.append(
                {
                    "type": "contact",
                    "id": contact.id,
                    "label": contact.name,
                    "subtitle": f"{contact.account.name} · {contact.title or contact.email}",
                    "href": "/accounts",
                }
            )

        opps = _owned_queryset(
            Opportunity.objects.select_related("owner", "account"),
            user,
        ).filter(Q(name__icontains=q) | Q(account__name__icontains=q))[:5]
        for opp in opps:
            results.append(
                {
                    "type": "opportunity",
                    "id": opp.id,
                    "label": opp.name,
                    "subtitle": f"{opp.account.name} · {opp.stage}",
                    "href": f"/opportunities/{opp.id}",
                }
            )

        return Response({"q": q, "results": results})


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(get_dashboard_for_user(request.user))


class AnalyticsView(APIView):
    """GET /api/analytics/<overview|funnel|activity>/?from=&to=

    POST /api/analytics/export/ — enqueue role-scoped CSV via Celery.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, kind: str):
        if kind not in {"overview", "funnel", "activity"}:
            return Response({"detail": "Unknown analytics endpoint"}, status=status.HTTP_404_NOT_FOUND)
        start, end = parse_date_range(request.query_params.get("from"), request.query_params.get("to"))
        return Response(get_analytics(kind, request.user, start, end))

    def post(self, request, kind: str):
        if kind != "export":
            return Response({"detail": "Use POST /api/analytics/export/"}, status=status.HTTP_404_NOT_FOUND)
        start, end = parse_date_range(request.data.get("from"), request.data.get("to"))
        job = JobRun.objects.create(
            type=JobRun.Type.ANALYTICS_EXPORT,
            status=JobRun.Status.PENDING,
            requested_by=request.user,
            message="Queued analytics export",
            result_meta={
                "from": start.date().isoformat(),
                "to": (end - timedelta(microseconds=1)).date().isoformat(),
            },
        )
        async_result = export_analytics_csv.delay(
            job.id,
            request.user.id,
            start.isoformat(),
            end.isoformat(),
        )
        job.celery_task_id = async_result.id or ""
        job.save(update_fields=["celery_task_id"])
        return Response(JobRunSerializer(job, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)


class ForecastView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_forecast_payload(request.user))

    def post(self, request):
        """Enqueue forecast CSV export (Manager preferred; AE can export own via same task filter in future)."""
        if request.user.role != User.Role.MANAGER:
            return Response({"detail": "Only managers can export team forecast."}, status=status.HTTP_403_FORBIDDEN)
        job = JobRun.objects.create(
            type=JobRun.Type.FORECAST_EXPORT,
            status=JobRun.Status.PENDING,
            requested_by=request.user,
            message="Queued forecast export",
        )
        async_result = export_forecast_csv.delay(job.id)
        job.celery_task_id = async_result.id or ""
        job.save(update_fields=["celery_task_id"])
        return Response(JobRunSerializer(job, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)


class OpsView(APIView):
    """Internal ops endpoints that demonstrate Celery Beat-style jobs on demand."""

    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request, action_name: str):
        mapping = {
            "stale-scan": (JobRun.Type.STALE_SCAN, flag_stale_deals),
            "warm-cache": (JobRun.Type.CACHE_WARM, warm_dashboard_cache),
            "reset-demo": (JobRun.Type.DEMO_RESET, reset_demo_data),
            "advance-sequences": (JobRun.Type.SEQUENCE_ADVANCE, advance_sequence_enrollments),
        }
        if action_name not in mapping:
            return Response({"detail": "Unknown action"}, status=status.HTTP_404_NOT_FOUND)
        job_type, task = mapping[action_name]
        job = JobRun.objects.create(
            type=job_type,
            status=JobRun.Status.PENDING,
            requested_by=request.user,
            message=f"Queued {action_name}",
        )
        async_result = task.delay(job.id)
        job.celery_task_id = async_result.id or ""
        job.save(update_fields=["celery_task_id"])
        return Response(JobRunSerializer(job, context={"request": request}).data, status=status.HTTP_202_ACCEPTED)
