from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User

from .analytics import get_analytics, invalidate_analytics_cache, parse_date_range
from .automation import assign_lead_via_routing, create_notification, ensure_default_routing_rule
from .deal_health import apply_deal_health
from .duplicates import check_duplicates, merge_records
from .filters import AccountFilter, LeadFilter, OpportunityFilter
from .models import (
    Account,
    Activity,
    AuditEvent,
    AvailabilitySlot,
    AiSuggestion,
    Contact,
    CustomFieldDefinition,
    DealComment,
    EmailMessage,
    EmailTemplate,
    JobRun,
    Lead,
    LeadRoutingRule,
    Meeting,
    Notification,
    Opportunity,
    Product,
    Quote,
    QuoteLineItem,
    Sequence,
    SequenceEnrollment,
    Task,
    Territory,
)
from .permissions import IsManager, IsSDRorManager, RoleScopedAccess
from .scoring import apply_lead_score
from .serializers import (
    AccountSerializer,
    ActivitySerializer,
    AiSuggestionSerializer,
    AuditEventSerializer,
    AvailabilitySlotSerializer,
    ContactSerializer,
    CustomFieldDefinitionSerializer,
    DealCommentSerializer,
    EmailComposeSerializer,
    EmailMessageSerializer,
    EmailTemplateSerializer,
    JobRunSerializer,
    LeadConvertSerializer,
    LeadRoutingRuleSerializer,
    LeadSerializer,
    MeetingSerializer,
    NotificationSerializer,
    OpportunityListSerializer,
    OpportunitySerializer,
    ProductSerializer,
    PublicBookSerializer,
    QuoteLineItemSerializer,
    QuoteSerializer,
    SequenceEnrollmentSerializer,
    SequenceSerializer,
    SequenceStepSerializer,
    TaskSerializer,
    TerritorySerializer,
)
from .services import OPEN_STAGES, build_forecast_payload, get_dashboard_for_user
from .tasks import (
    advance_sequence_enrollments,
    enqueue_notification,
    export_analytics_csv,
    export_forecast_csv,
    flag_stale_deals,
    import_leads_csv,
    reset_demo_data,
    send_outbound_email,
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
    ordering_fields = ["created_at", "company", "status", "score"]

    def get_queryset(self):
        return _owned_queryset(Lead.objects.select_related("owner"), self.request.user)

    def perform_create(self, serializer):
        explicit_owner = "owner" in serializer.validated_data
        lead = serializer.save(owner=serializer.validated_data.get("owner", self.request.user))
        apply_lead_score(lead, save=True)
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

    def perform_update(self, serializer):
        lead = serializer.save()
        apply_lead_score(lead, save=True)

    @action(detail=True, methods=["post"], url_path="rescore")
    def rescore(self, request, pk=None):
        lead = self.get_object()
        apply_lead_score(lead, save=True)
        return Response(LeadSerializer(lead).data)

    @action(detail=True, methods=["post"], url_path="ai-score-overlay")
    def ai_score_overlay(self, request, pk=None):
        from .ai_assists import generate_score_overlay

        lead = self.get_object()
        suggestion = generate_score_overlay(lead, user=request.user)
        adjusted = suggestion.output_json.get("adjusted_score")
        reasons = suggestion.output_json.get("reasons")
        if adjusted is not None:
            lead.score = int(adjusted)
            if reasons:
                lead.score_reasons = reasons
            lead.save(update_fields=["score", "score_reasons", "updated_at"])
        return Response(
            {
                "suggestion": AiSuggestionSerializer(suggestion).data,
                "lead": LeadSerializer(lead).data,
            }
        )

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
    filterset_class = AccountFilter
    search_fields = ["name", "domain", "industry"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        return _owned_queryset(
            Account.objects.select_related("owner", "territory"),
            self.request.user,
        )


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
    ordering_fields = ["amount", "close_date", "updated_at", "stage", "health"]

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
        apply_deal_health(opp, save=True)
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
        apply_deal_health(opp, save=True)
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

    @action(detail=False, methods=["get"], url_path="at-risk")
    def at_risk(self, request):
        """Open deals with at_risk or stalled health + $ total."""
        from django.db.models import Count

        qs = self.filter_queryset(self.get_queryset()).filter(
            stage__in=OPEN_STAGES,
            health__in=[Opportunity.Health.AT_RISK, Opportunity.Health.STALLED],
        )
        agg = qs.aggregate(total=Sum("amount"), count=Count("id"))
        return Response(
            {
                "count": agg["count"] or 0,
                "amount": str(agg["total"] or Decimal("0")),
                "deals": OpportunityListSerializer(qs.order_by("-amount"), many=True).data,
            }
        )
    @action(detail=True, methods=["post"], url_path="refresh-health")
    def refresh_health(self, request, pk=None):
        opp = self.get_object()
        apply_deal_health(opp, save=True)
        return Response(OpportunitySerializer(opp, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="ai-summary")
    def ai_summary(self, request, pk=None):
        from .ai_assists import generate_deal_summary

        opp = self.get_object()
        suggestion = generate_deal_summary(opp, user=request.user)
        return Response(AiSuggestionSerializer(suggestion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="ai-next-action")
    def ai_next_action(self, request, pk=None):
        from .ai_assists import generate_next_action

        opp = self.get_object()
        suggestion = generate_next_action(opp, user=request.user)
        apply = str(request.data.get("apply") or "").lower() in {"1", "true", "yes"}
        if apply and suggestion.title:
            Opportunity.objects.filter(pk=opp.pk).update(next_step=suggestion.title[:255])
            opp.refresh_from_db()
        return Response(
            {
                "suggestion": AiSuggestionSerializer(suggestion).data,
                "opportunity": OpportunitySerializer(opp, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="ai-email-draft")
    def ai_email_draft(self, request, pk=None):
        from .ai_assists import generate_email_draft

        opp = self.get_object()
        template = None
        template_id = request.data.get("template_id")
        if template_id:
            template = EmailTemplate.objects.filter(pk=template_id).first()
        suggestion = generate_email_draft(opp, template=template, user=request.user)
        return Response(AiSuggestionSerializer(suggestion).data, status=status.HTTP_201_CREATED)

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
        opp = Opportunity.objects.filter(pk=activity.opportunity_id).first()
        if opp:
            apply_deal_health(opp, save=True)
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
        return LeadRoutingRule.objects.select_related("last_assignee", "territory")


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


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "unit_price", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    queryset = Product.objects.all()

    def get_permissions(self):
        if self.action in {"create", "partial_update", "update"}:
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()


class TerritoryViewSet(viewsets.ModelViewSet):
    serializer_class = TerritorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "region", "industry"]
    search_fields = ["name", "region", "industry"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    queryset = Territory.objects.prefetch_related("members").all()

    def get_permissions(self):
        if self.action in {"create", "partial_update", "update"}:
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()


class CustomFieldDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = CustomFieldDefinitionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["entity", "field_type", "is_active"]
    search_fields = ["key", "label"]
    ordering_fields = ["entity", "label", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    queryset = CustomFieldDefinition.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        # Non-managers only see active definitions (for form rendering).
        if self.request.user.role != User.Role.MANAGER:
            qs = qs.filter(is_active=True)
        return qs

    def get_permissions(self):
        if self.action in {"create", "partial_update", "update"}:
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()


class AuditEventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated, IsManager]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["entity_type", "entity_id", "action", "actor"]
    ordering_fields = ["occurred_at", "id"]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        qs = AuditEvent.objects.select_related("actor")
        params = self.request.query_params
        date_from = params.get("from") or params.get("occurred_from")
        date_to = params.get("to") or params.get("occurred_to")
        if date_from:
            qs = qs.filter(occurred_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(occurred_at__date__lte=date_to)
        return qs


class AiSuggestionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AiSuggestionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["kind", "opportunity", "lead"]
    ordering_fields = ["created_at", "id"]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        qs = AiSuggestion.objects.select_related("created_by", "opportunity", "lead")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(
            Q(opportunity__owner=user) | Q(lead__owner=user) | Q(created_by=user)
        )


class QuoteViewSet(viewsets.ModelViewSet):
    serializer_class = QuoteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["opportunity", "status"]
    search_fields = ["name", "opportunity__name"]
    ordering_fields = ["created_at", "updated_at", "discount_percent"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Quote.objects.select_related(
            "opportunity",
            "opportunity__owner",
            "created_by",
            "approved_by",
        ).prefetch_related("line_items", "line_items__product")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(Q(opportunity__owner=user) | Q(created_by=user))

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        user = request.user
        if user.role == User.Role.MANAGER:
            return
        if obj.opportunity.owner_id != user.id and obj.created_by_id != user.id:
            self.permission_denied(request, message="Not allowed.")

    @action(detail=True, methods=["post"], url_path="approve", permission_classes=[IsAuthenticated, IsManager])
    def approve(self, request, pk=None):
        quote = self.get_object()
        if quote.status != Quote.Status.PENDING_APPROVAL:
            return Response(
                {"detail": "Only pending_approval quotes can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quote.status = Quote.Status.DRAFT
        quote.approved_by = request.user
        quote.approved_at = timezone.now()
        quote.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        create_notification(
            user=quote.created_by,
            title="Quote approved",
            body=f"{quote.name} discount approved — ready to send.",
            kind=Notification.Kind.STAGE,
            link=f"/opportunities/{quote.opportunity_id}",
        )
        return Response(QuoteSerializer(quote, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject", permission_classes=[IsAuthenticated, IsManager])
    def reject(self, request, pk=None):
        quote = self.get_object()
        if quote.status != Quote.Status.PENDING_APPROVAL:
            return Response(
                {"detail": "Only pending_approval quotes can be rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quote.status = Quote.Status.REJECTED
        quote.save(update_fields=["status", "updated_at"])
        create_notification(
            user=quote.created_by,
            title="Quote rejected",
            body=f"{quote.name} was rejected. Adjust discount and resubmit.",
            kind=Notification.Kind.STAGE,
            link=f"/opportunities/{quote.opportunity_id}",
        )
        return Response(QuoteSerializer(quote, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="send")
    def send(self, request, pk=None):
        quote = self.get_object()
        if quote.status == Quote.Status.PENDING_APPROVAL:
            return Response(
                {"detail": "Quote is awaiting manager approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if quote.status == Quote.Status.REJECTED:
            return Response(
                {"detail": "Rejected quotes cannot be sent. Create a new draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quote.status = Quote.Status.SENT
        quote.save(update_fields=["status", "updated_at"])
        return Response(QuoteSerializer(quote, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="accept")
    def accept(self, request, pk=None):
        quote = self.get_object()
        if quote.status != Quote.Status.SENT:
            return Response(
                {"detail": "Only sent quotes can be accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quote.status = Quote.Status.ACCEPTED
        quote.save(update_fields=["status", "updated_at"])
        return Response(QuoteSerializer(quote, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        quote = self.get_object()
        lines_html = "".join(
            (
                "<tr>"
                f"<td>{escape(line.description)}</td>"
                f"<td style='text-align:right'>{line.quantity}</td>"
                f"<td style='text-align:right'>${line.unit_price}</td>"
                f"<td style='text-align:right'>${line.line_total}</td>"
                "</tr>"
            )
            for line in quote.line_items.all()
        )
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{escape(quote.name)}</title>
<style>
body {{ font-family: Georgia, serif; margin: 2rem; color: #1a1a1a; }}
h1 {{ font-size: 1.6rem; margin-bottom: 0.25rem; }}
.meta {{ color: #555; margin-bottom: 1.5rem; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border-bottom: 1px solid #ddd; padding: 0.5rem; text-align: left; }}
.totals {{ margin-top: 1.5rem; text-align: right; }}
.badge {{ display: inline-block; padding: 0.15rem 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.8rem; }}
</style></head><body>
<p class="badge">{escape(quote.status)}</p>
<h1>{escape(quote.name)}</h1>
<p class="meta">Deal: {escape(quote.opportunity.name)} · Discount: {quote.discount_percent}%</p>
<table>
<thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Line</th></tr></thead>
<tbody>{lines_html or "<tr><td colspan='4'>No line items</td></tr>"}</tbody>
</table>
<div class="totals">
  <div>Subtotal: ${quote.subtotal}</div>
  <div><strong>Total: ${quote.total}</strong></div>
</div>
{f"<p>{escape(quote.notes)}</p>" if quote.notes else ""}
</body></html>"""
        return HttpResponse(html, content_type="text/html")


class QuoteLineItemViewSet(viewsets.ModelViewSet):
    serializer_class = QuoteLineItemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["quote"]
    ordering_fields = ["id"]
    http_method_names = ["get", "post", "patch", "head", "options", "delete"]

    def get_queryset(self):
        qs = QuoteLineItem.objects.select_related("quote", "quote__opportunity", "product")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(Q(quote__opportunity__owner=user) | Q(quote__created_by=user))


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
                    "href": f"/leads/{lead.id}",
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
                    "href": f"/accounts/{account.id}",
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
                    "href": f"/contacts/{contact.id}",
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


class DuplicateCheckView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        entity_type = data.get("entity_type") or ""
        suspects = check_duplicates(
            entity_type=entity_type,
            email=data.get("email") or "",
            name=data.get("name") or "",
            company=data.get("company") or "",
            domain=data.get("domain") or "",
            account_id=data.get("account_id") or data.get("account"),
            exclude_id=data.get("exclude_id"),
        )
        return Response({"entity_type": entity_type, "count": len(suspects), "duplicates": suspects})


class DuplicateMergeView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def post(self, request):
        result = merge_records(
            entity_type=request.data.get("entity_type") or "",
            winner_id=int(request.data["winner_id"]),
            loser_id=int(request.data["loser_id"]),
            actor=request.user,
        )
        return Response(result)


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


class TimelineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .timeline import build_timeline

        params = request.query_params
        try:
            account_id = int(params["account"]) if params.get("account") else None
            contact_id = int(params["contact"]) if params.get("contact") else None
            lead_id = int(params["lead"]) if params.get("lead") else None
            opportunity_id = int(params["opportunity"]) if params.get("opportunity") else None
        except (TypeError, ValueError):
            return Response({"detail": "Invalid id filter"}, status=status.HTTP_400_BAD_REQUEST)
        if not any([account_id, contact_id, lead_id, opportunity_id]):
            return Response(
                {"detail": "Provide account, contact, lead, or opportunity."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        limit = min(int(params.get("limit") or 100), 200)
        results = build_timeline(
            account_id=account_id,
            contact_id=contact_id,
            lead_id=lead_id,
            opportunity_id=opportunity_id,
            limit=limit,
        )
        return Response({"results": results})


class EmailMessageViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = EmailMessageSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["lead", "contact", "opportunity", "status"]
    ordering_fields = ["created_at", "sent_at"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = EmailMessage.objects.select_related("sent_by", "lead", "contact", "opportunity")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(
            Q(sent_by=user)
            | Q(lead__owner=user)
            | Q(opportunity__owner=user)
            | Q(contact__account__owner=user)
        )

    def create(self, request, *args, **kwargs):
        from .email_tracking import new_tracking_token, text_to_html

        compose = EmailComposeSerializer(data=request.data)
        compose.is_valid(raise_exception=True)
        data = compose.validated_data
        body = data["body"]
        msg = EmailMessage.objects.create(
            to_email=data["to_email"],
            subject=data["subject"],
            body_text=body,
            body_html=text_to_html(body),
            status=EmailMessage.Status.QUEUED,
            lead=data.get("lead"),
            contact=data.get("contact"),
            opportunity=data.get("opportunity"),
            sent_by=request.user,
            tracking_token=new_tracking_token(),
        )
        send_outbound_email.delay(msg.id)
        return Response(EmailMessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class AvailabilitySlotViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySlotSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = AvailabilitySlot.objects.select_related("user")
        user = self.request.user
        user_id = self.request.query_params.get("user")
        if user.role == User.Role.MANAGER and user_id:
            return qs.filter(user_id=user_id)
        return qs.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MeetingViewSet(viewsets.ModelViewSet):
    serializer_class = MeetingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "host", "opportunity", "lead"]
    ordering_fields = ["starts_at", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Meeting.objects.select_related("host", "lead", "contact", "opportunity")
        user = self.request.user
        if user.role == User.Role.MANAGER:
            return qs
        return qs.filter(host=user)

    def perform_create(self, serializer):
        from .timeline import record_timeline_event

        meeting = serializer.save(host=self.request.user)
        if meeting.opportunity_id:
            Activity.objects.create(
                opportunity=meeting.opportunity,
                type=Activity.Type.MEETING,
                subject=meeting.title,
                body=f"With {meeting.invitee_name} <{meeting.invitee_email}>",
                due_at=meeting.starts_at,
                created_by=self.request.user,
            )
            record_timeline_event(
                entity_type="opportunity",
                entity_id=meeting.opportunity_id,
                event_type="meeting",
                title=f"Meeting: {meeting.title}",
                body=f"{meeting.invitee_name} · {meeting.starts_at.isoformat()}",
                actor=self.request.user,
                opportunity_id=meeting.opportunity_id,
                meta={"id": meeting.id},
            )
        create_notification(
            user=meeting.host,
            title=f"Meeting scheduled: {meeting.title}",
            body=f"{meeting.invitee_name} at {meeting.starts_at}",
            kind=Notification.Kind.MEETING,
            link="/calendar",
        )


class PublicBookingView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug: str):
        from datetime import datetime, timedelta as td

        from django.utils.dateparse import parse_date

        try:
            host = User.objects.get(booking_slug=slug, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Booking page not found."}, status=status.HTTP_404_NOT_FOUND)

        start_s = request.query_params.get("from")
        end_s = request.query_params.get("to")
        start_date = parse_date(start_s) if start_s else timezone.localdate()
        end_date = parse_date(end_s) if end_s else start_date + td(days=7)
        if not start_date or not end_date:
            return Response({"detail": "Invalid from/to dates"}, status=status.HTTP_400_BAD_REQUEST)

        slots = list(AvailabilitySlot.objects.filter(user=host))
        existing = list(
            Meeting.objects.filter(
                host=host,
                status=Meeting.Status.SCHEDULED,
                starts_at__date__gte=start_date,
                starts_at__date__lte=end_date,
            )
        )
        available = []
        day = start_date
        while day <= end_date:
            weekday = day.weekday()  # Mon=0
            for slot in slots:
                if slot.weekday != weekday:
                    continue
                starts = timezone.make_aware(datetime.combine(day, slot.start_time))
                ends = timezone.make_aware(datetime.combine(day, slot.end_time))
                conflict = any(
                    m.starts_at < ends and m.ends_at > starts for m in existing
                )
                if not conflict and starts > timezone.now():
                    available.append(
                        {
                            "starts_at": starts.isoformat(),
                            "ends_at": ends.isoformat(),
                        }
                    )
            day += td(days=1)

        return Response(
            {
                "host": {
                    "username": host.username,
                    "first_name": host.first_name,
                    "last_name": host.last_name,
                    "booking_slug": host.booking_slug,
                },
                "slots": available,
            }
        )

    def post(self, request, slug: str):
        from .timeline import record_timeline_event

        try:
            host = User.objects.get(booking_slug=slug, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Booking page not found."}, status=status.HTTP_404_NOT_FOUND)

        ser = PublicBookSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        conflict = Meeting.objects.filter(
            host=host,
            status=Meeting.Status.SCHEDULED,
            starts_at__lt=data["ends_at"],
            ends_at__gt=data["starts_at"],
        ).exists()
        if conflict:
            return Response({"detail": "That slot is no longer available."}, status=status.HTTP_409_CONFLICT)

        meeting = Meeting.objects.create(
            host=host,
            title=data.get("title") or f"Meeting with {data['invitee_name']}",
            starts_at=data["starts_at"],
            ends_at=data["ends_at"],
            invitee_name=data["invitee_name"],
            invitee_email=data["invitee_email"],
            notes=data.get("notes") or "",
            lead=data.get("lead"),
            contact=data.get("contact"),
            opportunity=data.get("opportunity"),
        )
        if meeting.opportunity_id:
            Activity.objects.create(
                opportunity=meeting.opportunity,
                type=Activity.Type.MEETING,
                subject=meeting.title,
                body=f"Booked by {meeting.invitee_name} <{meeting.invitee_email}>",
                due_at=meeting.starts_at,
                created_by=host,
            )
            record_timeline_event(
                entity_type="opportunity",
                entity_id=meeting.opportunity_id,
                event_type="meeting",
                title=f"Meeting booked: {meeting.title}",
                body=f"{meeting.invitee_name} · {meeting.starts_at.isoformat()}",
                actor=host,
                opportunity_id=meeting.opportunity_id,
                meta={"id": meeting.id},
            )
        if meeting.lead_id:
            record_timeline_event(
                entity_type="lead",
                entity_id=meeting.lead_id,
                event_type="meeting",
                title=f"Meeting booked: {meeting.title}",
                body=f"{meeting.invitee_name} · {meeting.starts_at.isoformat()}",
                actor=host,
                lead_id=meeting.lead_id,
                meta={"id": meeting.id},
            )
        Task.objects.create(
            title=f"Meeting: {meeting.title}",
            description=f"With {meeting.invitee_name} <{meeting.invitee_email}>",
            due_at=meeting.starts_at,
            owner=host,
            lead=meeting.lead,
            opportunity=meeting.opportunity,
        )
        create_notification(
            user=host,
            title=f"New booking: {meeting.title}",
            body=f"{meeting.invitee_name} booked {meeting.starts_at}",
            kind=Notification.Kind.MEETING,
            link="/calendar",
        )
        return Response(MeetingSerializer(meeting).data, status=status.HTTP_201_CREATED)
