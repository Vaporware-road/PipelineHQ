import re
from datetime import timedelta

from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer

from .automation import apply_closed_timestamp, notify_comment_mentions, validate_stage_transition
from .custom_fields import get_custom_field_map, set_custom_fields
from .duplicates import check_duplicates
from .models import (
    Account,
    Activity,
    AuditEvent,
    AvailabilitySlot,
    AiSuggestion,
    Comment,
    Contact,
    CustomFieldDefinition,
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
    SequenceStep,
    Task,
    Territory,
)


class CustomFieldsSerializerMixin:
    """Read/write `custom_fields` dict; stamp audit/timeline actor on save."""

    custom_fields_entity: str = ""

    def get_fields(self):
        fields = super().get_fields()
        fields["custom_fields"] = serializers.DictField(required=False, allow_empty=True)
        return fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["custom_fields"] = get_custom_field_map(self.custom_fields_entity, instance.pk)
        return data

    def _stamp_actor(self, instance):
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            instance._audit_actor = request.user
            instance._timeline_actor = request.user

    def create(self, validated_data):
        cf = validated_data.pop("custom_fields", serializers.empty)
        Model = self.Meta.model
        instance = Model(**validated_data)
        self._stamp_actor(instance)
        instance.save()
        if cf is not serializers.empty:
            set_custom_fields(self.custom_fields_entity, instance.pk, cf)
        return instance

    def update(self, instance, validated_data):
        cf = validated_data.pop("custom_fields", serializers.empty)
        self._stamp_actor(instance)
        instance = super().update(instance, validated_data)
        if cf is not serializers.empty:
            set_custom_fields(self.custom_fields_entity, instance.pk, cf)
        return instance


class TerritorySerializer(serializers.ModelSerializer):
    member_ids = serializers.PrimaryKeyRelatedField(
        source="members",
        queryset=User.objects.all(),
        many=True,
        required=False,
    )
    members = UserSerializer(many=True, read_only=True)
    account_count = serializers.SerializerMethodField()

    class Meta:
        model = Territory
        fields = (
            "id",
            "name",
            "region",
            "industry",
            "is_active",
            "members",
            "member_ids",
            "account_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "members", "account_count")

    def get_account_count(self, obj):
        return obj.accounts.count()


class CustomFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFieldDefinition
        fields = (
            "id",
            "entity",
            "key",
            "label",
            "field_type",
            "options",
            "required",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_key(self, value):
        return value.strip().lower().replace(" ", "_")

    def validate(self, attrs):
        field_type = attrs.get("field_type") or getattr(self.instance, "field_type", None)
        options = attrs.get("options", getattr(self.instance, "options", []) if self.instance else [])
        if field_type == CustomFieldDefinition.FieldType.SELECT and not options:
            raise serializers.ValidationError({"options": "Select fields need at least one option."})
        return attrs


class AuditEventSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "actor",
            "action",
            "entity_type",
            "entity_id",
            "entity_label",
            "changes",
            "occurred_at",
        )
        read_only_fields = fields


class AccountSerializer(CustomFieldsSerializerMixin, serializers.ModelSerializer):
    custom_fields_entity = "account"
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    territory = serializers.IntegerField(source="territory_id", read_only=True, allow_null=True)
    territory_id = serializers.PrimaryKeyRelatedField(
        source="territory",
        queryset=Territory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    territory_name = serializers.CharField(source="territory.name", read_only=True, default=None)

    class Meta:
        model = Account
        fields = (
            "id",
            "name",
            "domain",
            "industry",
            "owner",
            "owner_id",
            "territory",
            "territory_id",
            "territory_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "territory", "territory_name")

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        request = self.context.get("request")
        force = False
        if request is not None:
            raw = request.data.get("force_create")
            force = raw in (True, "true", "True", "1", 1)
        if not force:
            suspects = check_duplicates(
                entity_type="account",
                name=validated_data.get("name") or "",
                domain=validated_data.get("domain") or "",
            )
            if suspects:
                raise serializers.ValidationError(
                    {
                        "detail": "Possible duplicate accounts found.",
                        "duplicates": suspects,
                    }
                )
        return super().create(validated_data)


class ContactSerializer(CustomFieldsSerializerMixin, serializers.ModelSerializer):
    custom_fields_entity = "contact"
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = Contact
        fields = (
            "id",
            "account",
            "account_name",
            "name",
            "email",
            "title",
            "phone",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def create(self, validated_data):
        request = self.context.get("request")
        force = False
        if request is not None:
            raw = request.data.get("force_create")
            force = raw in (True, "true", "True", "1", 1)
        if not force:
            account = validated_data.get("account")
            suspects = check_duplicates(
                entity_type="contact",
                email=validated_data.get("email") or "",
                name=validated_data.get("name") or "",
                account_id=getattr(account, "id", account),
            )
            if suspects:
                raise serializers.ValidationError(
                    {
                        "detail": "Possible duplicate contacts found.",
                        "duplicates": suspects,
                    }
                )
        return super().create(validated_data)

class ActivitySerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = Activity
        fields = (
            "id",
            "opportunity",
            "type",
            "subject",
            "body",
            "due_at",
            "completed",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at", "created_by")

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = (
            "id",
            "author",
            "body",
            "parent",
            "opportunity",
            "lead",
            "task",
            "meeting",
            "replies",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "author",
            "opportunity",
            "lead",
            "task",
            "meeting",
            "created_at",
            "updated_at",
        )

    def get_replies(self, obj):
        if self.context.get("skip_replies"):
            return []
        qs = obj.replies.select_related("author").order_by("created_at")
        return CommentSerializer(qs, many=True, context={**self.context, "skip_replies": True}).data

    def create(self, validated_data):
        comment = Comment.objects.create(
            author=self.context["request"].user,
            **validated_data,
        )
        notify_comment_mentions(comment)
        return comment


# Back-compat alias
DealCommentSerializer = CommentSerializer


class OpportunitySerializer(CustomFieldsSerializerMixin, serializers.ModelSerializer):
    custom_fields_entity = "opportunity"
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    account_name = serializers.CharField(source="account.name", read_only=True)
    activities = ActivitySerializer(many=True, read_only=True)
    comments = serializers.SerializerMethodField()
    is_open = serializers.BooleanField(read_only=True)
    meddic_checklist = serializers.SerializerMethodField()

    class Meta:
        model = Opportunity
        fields = (
            "id",
            "name",
            "account",
            "account_name",
            "primary_contact",
            "amount",
            "stage",
            "close_date",
            "forecast_category",
            "next_step",
            "is_stale",
            "is_open",
            "stage_entered_at",
            "health",
            "health_reasons",
            "owner",
            "owner_id",
            "activities",
            "comments",
            "metrics",
            "economic_buyer",
            "decision_criteria",
            "decision_process",
            "identify_pain",
            "champion",
            "win_reason",
            "loss_reason",
            "closed_at",
            "meddic_checklist",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "is_stale",
            "stage_entered_at",
            "health",
            "health_reasons",
            "closed_at",
            "created_at",
            "updated_at",
        )

    def get_comments(self, obj):
        qs = obj.comments.filter(parent__isnull=True).select_related("author").prefetch_related("replies__author")
        return CommentSerializer(qs, many=True, context=self.context).data

    def get_meddic_checklist(self, obj):
        return obj.meddic_checklist()

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and "stage" in attrs:
            validate_stage_transition(instance, attrs["stage"], attrs)
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        validated_data.setdefault("stage_entered_at", timezone.now())
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_stage = validated_data.get("stage", instance.stage)
        if "stage" in validated_data and validated_data["stage"] != instance.stage:
            validated_data["stage_entered_at"] = timezone.now()
        apply_closed_timestamp(instance, new_stage)
        if "closed_at" not in validated_data:
            validated_data["closed_at"] = instance.closed_at
        return super().update(instance, validated_data)


class OpportunityListSerializer(OpportunitySerializer):
    class Meta(OpportunitySerializer.Meta):
        fields = tuple(
            f for f in OpportunitySerializer.Meta.fields if f not in {"activities", "comments"}
        )


class LeadSerializer(CustomFieldsSerializerMixin, serializers.ModelSerializer):
    custom_fields_entity = "lead"
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Lead
        fields = (
            "id",
            "name",
            "email",
            "company",
            "title",
            "industry",
            "status",
            "source",
            "priority",
            "budget_amount",
            "notes",
            "score",
            "score_reasons",
            "owner",
            "owner_id",
            "converted_account",
            "converted_contact",
            "converted_opportunity",
            "converted_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "score",
            "score_reasons",
            "converted_account",
            "converted_contact",
            "converted_opportunity",
            "converted_at",
            "created_at",
            "updated_at",
        )

    def validate_budget_amount(self, value):
        if value is not None and value < 1000:
            raise serializers.ValidationError("Budget must be at least $1,000.")
        return value

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        request = self.context.get("request")
        force = False
        if request is not None:
            raw = request.data.get("force_create")
            force = raw in (True, "true", "True", "1", 1)
        if not force:
            suspects = check_duplicates(
                entity_type="lead",
                email=validated_data.get("email") or "",
                name=validated_data.get("name") or "",
                company=validated_data.get("company") or "",
            )
            if suspects:
                raise serializers.ValidationError(
                    {
                        "detail": "Possible duplicate leads found.",
                        "duplicates": suspects,
                    }
                )
        return super().create(validated_data)


class LeadConvertSerializer(serializers.Serializer):
    opportunity_name = serializers.CharField(required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    stage = serializers.ChoiceField(
        choices=Opportunity.Stage.choices,
        required=False,
        default=Opportunity.Stage.DISCOVERY,
    )
    close_date = serializers.DateField(required=False)
    assign_to_ae_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.AE),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        lead: Lead = self.context["lead"]
        if lead.status == Lead.Status.CONVERTED:
            raise serializers.ValidationError("Lead is already converted.")
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        lead: Lead = self.context["lead"]
        request_user = self.context["request"].user
        ae = self.validated_data.get("assign_to_ae_id")
        if ae is None:
            if request_user.role == User.Role.AE:
                ae = request_user
            else:
                # SDR/Manager convert → hand deal to first AE so it appears on AE pipeline
                ae = User.objects.filter(role=User.Role.AE).order_by("id").first() or request_user

        account = Account.objects.create(
            name=lead.company,
            domain=lead.email.split("@")[-1] if "@" in lead.email else "",
            owner=ae,
        )
        contact = Contact.objects.create(
            account=account,
            name=lead.name,
            email=lead.email,
            title=lead.title,
        )
        opportunity = Opportunity.objects.create(
            name=self.validated_data.get("opportunity_name") or f"{lead.company} — New deal",
            account=account,
            primary_contact=contact,
            amount=self.validated_data.get("amount") or 0,
            stage=self.validated_data.get("stage") or Opportunity.Stage.DISCOVERY,
            close_date=self.validated_data.get("close_date") or timezone.localdate(),
            owner=ae,
        )
        lead.status = Lead.Status.CONVERTED
        lead.converted_account = account
        lead.converted_contact = contact
        lead.converted_opportunity = opportunity
        lead.converted_at = timezone.now()
        lead.save(
            update_fields=[
                "status",
                "converted_account",
                "converted_contact",
                "converted_opportunity",
                "converted_at",
                "updated_at",
            ]
        )
        return {
            "lead": lead,
            "account": account,
            "contact": contact,
            "opportunity": opportunity,
        }


class JobRunSerializer(serializers.ModelSerializer):
    requested_by = UserSerializer(read_only=True)
    result_file_url = serializers.SerializerMethodField()

    class Meta:
        model = JobRun
        fields = (
            "id",
            "type",
            "status",
            "requested_by",
            "celery_task_id",
            "message",
            "result_meta",
            "result_file_url",
            "created_at",
            "updated_at",
        )

    def get_result_file_url(self, obj):
        if obj.result_file:
            request = self.context.get("request")
            url = obj.result_file.url
            return request.build_absolute_uri(url) if request else url
        return None


class TaskSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    created_by = UserSerializer(read_only=True)
    lead_name = serializers.CharField(source="lead.name", read_only=True, default=None)
    opportunity_name = serializers.CharField(source="opportunity.name", read_only=True, default=None)
    children = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = (
            "id",
            "title",
            "description",
            "due_at",
            "completed",
            "completed_at",
            "status",
            "priority",
            "owner",
            "owner_id",
            "created_by",
            "parent",
            "lead",
            "lead_name",
            "opportunity",
            "opportunity_name",
            "children",
            "comment_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("completed_at", "created_by", "created_at", "updated_at")

    def get_children(self, obj):
        if self.context.get("skip_children"):
            return []
        qs = obj.children.select_related("owner", "created_by", "lead", "opportunity").order_by("due_at", "id")
        return TaskSerializer(qs, many=True, context={**self.context, "skip_children": True}).data

    def get_comment_count(self, obj):
        return obj.comments.count()

    def create(self, validated_data):
        request = self.context["request"]
        validated_data.setdefault("owner", request.user)
        validated_data["created_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        completed = validated_data.get("completed", instance.completed)
        status_val = validated_data.get("status", instance.status)
        if completed and status_val != Task.Status.DONE:
            validated_data["status"] = Task.Status.DONE
        if validated_data.get("status", status_val) == Task.Status.DONE:
            validated_data["completed"] = True
            if not instance.completed_at:
                validated_data["completed_at"] = timezone.now()
        elif "completed" in validated_data and not completed:
            validated_data["completed_at"] = None
            if status_val == Task.Status.DONE:
                validated_data["status"] = Task.Status.TODO
        elif "status" in validated_data and status_val != Task.Status.DONE:
            validated_data["completed"] = False
            validated_data["completed_at"] = None
        return super().update(instance, validated_data)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "title",
            "body",
            "kind",
            "link",
            "is_read",
            "created_at",
        )
        read_only_fields = ("title", "body", "kind", "link", "created_at")


class LeadRoutingRuleSerializer(serializers.ModelSerializer):
    last_assignee = UserSerializer(read_only=True)
    territory = serializers.IntegerField(source="territory_id", read_only=True, allow_null=True)
    territory_id = serializers.PrimaryKeyRelatedField(
        source="territory",
        queryset=Territory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    territory_name = serializers.CharField(source="territory.name", read_only=True, default=None)

    class Meta:
        model = LeadRoutingRule
        fields = (
            "id",
            "name",
            "enabled",
            "source",
            "strategy",
            "territory",
            "territory_id",
            "territory_name",
            "last_assignee",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("strategy", "created_at", "updated_at", "territory", "territory_name")

class EmailTemplateSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = EmailTemplate
        fields = (
            "id",
            "name",
            "subject",
            "body",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SequenceStepSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True, default=None)
    template_subject = serializers.CharField(source="template.subject", read_only=True, default=None)

    class Meta:
        model = SequenceStep
        fields = (
            "id",
            "sequence",
            "order",
            "delay_days",
            "step_type",
            "template",
            "template_name",
            "template_subject",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class SequenceSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    steps = SequenceStepSerializer(many=True, read_only=True)
    step_count = serializers.SerializerMethodField()
    enrollment_count = serializers.SerializerMethodField()

    class Meta:
        model = Sequence
        fields = (
            "id",
            "name",
            "description",
            "is_active",
            "created_by",
            "steps",
            "step_count",
            "enrollment_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_step_count(self, obj):
        return obj.steps.count()

    def get_enrollment_count(self, obj):
        return obj.enrollments.count()

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SequenceEnrollmentSerializer(serializers.ModelSerializer):
    sequence_name = serializers.CharField(source="sequence.name", read_only=True)
    lead_name = serializers.CharField(source="lead.name", read_only=True)
    lead_company = serializers.CharField(source="lead.company", read_only=True)
    enrolled_by = UserSerializer(read_only=True)
    recent_messages = serializers.SerializerMethodField()

    class Meta:
        model = SequenceEnrollment
        fields = (
            "id",
            "sequence",
            "sequence_name",
            "lead",
            "lead_name",
            "lead_company",
            "status",
            "current_step_order",
            "next_run_at",
            "enrolled_by",
            "last_message",
            "cancelled_at",
            "cancel_reason",
            "recent_messages",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "current_step_order",
            "next_run_at",
            "enrolled_by",
            "last_message",
            "cancelled_at",
            "created_at",
            "updated_at",
        )

    def get_recent_messages(self, obj):
        msgs = obj.email_messages.order_by("-created_at")[:5]
        return [
            {
                "id": m.id,
                "subject": m.subject,
                "status": m.status,
                "open_count": m.open_count,
                "click_count": m.click_count,
                "opened_at": m.opened_at,
                "clicked_at": m.clicked_at,
                "sent_at": m.sent_at,
            }
            for m in msgs
        ]

    def validate(self, attrs):
        sequence = attrs.get("sequence") or getattr(self.instance, "sequence", None)
        lead = attrs.get("lead") or getattr(self.instance, "lead", None)
        if sequence and not sequence.is_active:
            raise serializers.ValidationError({"sequence": "Sequence is not active."})
        if sequence and not sequence.steps.exists():
            raise serializers.ValidationError({"sequence": "Sequence has no steps."})
        if self.instance is None and sequence and lead:
            existing = SequenceEnrollment.objects.filter(sequence=sequence, lead=lead).first()
            if existing and existing.status == SequenceEnrollment.Status.ACTIVE:
                raise serializers.ValidationError("Lead is already enrolled in this sequence.")
            if existing and existing.status in {
                SequenceEnrollment.Status.CANCELLED,
                SequenceEnrollment.Status.COMPLETED,
            }:
                self.context["reenrollment"] = existing
        return attrs

    def create(self, validated_data):
        sequence = validated_data["sequence"]
        first_step = sequence.steps.order_by("order").first()
        delay = first_step.delay_days if first_step else 0
        existing = self.context.get("reenrollment")
        if existing:
            existing.status = SequenceEnrollment.Status.ACTIVE
            existing.current_step_order = 0
            existing.next_run_at = timezone.now() + timedelta(days=delay)
            existing.last_message = "Re-enrolled — waiting for first step"
            existing.cancelled_at = None
            existing.cancel_reason = ""
            existing.enrolled_by = self.context["request"].user
            existing.save()
            return existing
        validated_data["enrolled_by"] = self.context["request"].user
        validated_data["status"] = SequenceEnrollment.Status.ACTIVE
        validated_data["current_step_order"] = 0
        validated_data["next_run_at"] = timezone.now() + timedelta(days=delay)
        validated_data["last_message"] = "Enrolled — waiting for first step"
        return super().create(validated_data)


class EmailMessageSerializer(serializers.ModelSerializer):
    sent_by = UserSerializer(read_only=True)

    class Meta:
        model = EmailMessage
        fields = (
            "id",
            "to_email",
            "subject",
            "body_text",
            "body_html",
            "status",
            "lead",
            "contact",
            "opportunity",
            "enrollment",
            "template",
            "sent_by",
            "tracking_token",
            "sent_at",
            "error",
            "opened_at",
            "open_count",
            "clicked_at",
            "click_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "enrollment",
            "template",
            "sent_by",
            "tracking_token",
            "sent_at",
            "error",
            "opened_at",
            "open_count",
            "clicked_at",
            "click_count",
            "created_at",
            "updated_at",
            "body_html",
        )


class EmailComposeSerializer(serializers.Serializer):
    to_email = serializers.EmailField(required=False, allow_blank=True)
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()
    lead = serializers.PrimaryKeyRelatedField(queryset=Lead.objects.all(), required=False, allow_null=True)
    contact = serializers.PrimaryKeyRelatedField(queryset=Contact.objects.all(), required=False, allow_null=True)
    opportunity = serializers.PrimaryKeyRelatedField(
        queryset=Opportunity.objects.all(), required=False, allow_null=True
    )

    def validate(self, attrs):
        to_email = (attrs.get("to_email") or "").strip()
        contact = attrs.get("contact")
        lead = attrs.get("lead")
        opportunity = attrs.get("opportunity")
        if not to_email:
            if contact and contact.email:
                to_email = contact.email
            elif lead and lead.email:
                to_email = lead.email
            elif opportunity and opportunity.primary_contact_id and opportunity.primary_contact.email:
                to_email = opportunity.primary_contact.email
        if not to_email:
            raise serializers.ValidationError({"to_email": "Recipient email is required."})
        attrs["to_email"] = to_email
        return attrs


class AvailabilitySlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilitySlot
        fields = ("id", "user", "weekday", "start_time", "end_time", "created_at", "updated_at")
        read_only_fields = ("user", "created_at", "updated_at")

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        if weekday is not None and not (0 <= weekday <= 6):
            raise serializers.ValidationError({"weekday": "Must be 0 (Mon) through 6 (Sun)."})
        if start and end and start >= end:
            raise serializers.ValidationError({"end_time": "Must be after start_time."})
        return attrs


_EMAIL_SPLIT_RE = re.compile(r"[\s,;]+")


def parse_invitee_emails(raw: str) -> list[str]:
    """Accept a single email or a bulk list separated by commas, spaces, newlines, or semicolons."""
    parts = [p.strip() for p in _EMAIL_SPLIT_RE.split((raw or "").strip()) if p.strip()]
    seen: set[str] = set()
    emails: list[str] = []
    for part in parts:
        try:
            validate_email(part)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(f"Invalid email: {part}") from exc
        key = part.lower()
        if key not in seen:
            seen.add(key)
            emails.append(part)
    return emails


class MeetingSerializer(serializers.ModelSerializer):
    host = UserSerializer(read_only=True)
    mentioned_users = UserSerializer(many=True, read_only=True)
    mentioned_user_ids = serializers.PrimaryKeyRelatedField(
        source="mentioned_users",
        queryset=User.objects.filter(is_active=True),
        many=True,
        write_only=True,
        required=False,
    )

    class Meta:
        model = Meeting
        fields = (
            "id",
            "host",
            "title",
            "job_detail",
            "target_role",
            "mentioned_users",
            "mentioned_user_ids",
            "starts_at",
            "ends_at",
            "invitee_name",
            "invitee_email",
            "status",
            "lead",
            "contact",
            "opportunity",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("host", "created_at", "updated_at")

    def validate_invitee_email(self, value):
        emails = parse_invitee_emails(value)
        if not emails:
            raise serializers.ValidationError("At least one invitee email is required.")
        return ", ".join(emails)

    def validate_target_role(self, value):
        if not value:
            return ""
        allowed = {c.value for c in Meeting.TargetRole}
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid target role. Choose from: {', '.join(sorted(allowed))}.")
        return value


class PublicBookSerializer(serializers.Serializer):
    invitee_name = serializers.CharField(max_length=200)
    invitee_email = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    title = serializers.CharField(max_length=255, required=False, allow_blank=True, default="Meeting")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lead = serializers.PrimaryKeyRelatedField(queryset=Lead.objects.all(), required=False, allow_null=True)
    contact = serializers.PrimaryKeyRelatedField(queryset=Contact.objects.all(), required=False, allow_null=True)
    opportunity = serializers.PrimaryKeyRelatedField(
        queryset=Opportunity.objects.all(), required=False, allow_null=True
    )

    def validate_invitee_email(self, value):
        emails = parse_invitee_emails(value)
        if not emails:
            raise serializers.ValidationError("At least one invitee email is required.")
        return ", ".join(emails)

    def validate(self, attrs):
        if attrs["starts_at"] >= attrs["ends_at"]:
            raise serializers.ValidationError({"ends_at": "Must be after starts_at."})
        return attrs


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "sku",
            "description",
            "unit_price",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class QuoteLineItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True, default=None)

    class Meta:
        model = QuoteLineItem
        fields = (
            "id",
            "quote",
            "product",
            "product_name",
            "description",
            "quantity",
            "unit_price",
            "line_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")
        extra_kwargs = {"quote": {"required": False}}

    def validate(self, attrs):
        product = attrs.get("product") or getattr(self.instance, "product", None)
        if product and not attrs.get("description") and not getattr(self.instance, "description", None):
            attrs.setdefault("description", product.name)
        if product and "unit_price" not in attrs and self.instance is None:
            attrs.setdefault("unit_price", product.unit_price)
        description = attrs.get("description") or getattr(self.instance, "description", None)
        if not description:
            raise serializers.ValidationError({"description": "Description is required."})
        return attrs


class QuoteSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    approved_by = UserSerializer(read_only=True)
    line_items = QuoteLineItemSerializer(many=True, required=False)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    needs_approval = serializers.BooleanField(read_only=True)
    opportunity_name = serializers.CharField(source="opportunity.name", read_only=True)

    class Meta:
        model = Quote
        fields = (
            "id",
            "opportunity",
            "opportunity_name",
            "name",
            "status",
            "discount_percent",
            "notes",
            "created_by",
            "approved_by",
            "approved_at",
            "line_items",
            "subtotal",
            "total",
            "needs_approval",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_by",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
        )

    def _apply_approval_gate(self, quote: Quote, actor):
        from django.conf import settings

        threshold = settings.QUOTE_DISCOUNT_APPROVAL_PCT
        is_manager = getattr(actor, "role", None) == User.Role.MANAGER
        if quote.discount_percent > threshold and not is_manager:
            if quote.status in {Quote.Status.DRAFT, Quote.Status.PENDING_APPROVAL}:
                quote.status = Quote.Status.PENDING_APPROVAL
                quote.approved_by = None
                quote.approved_at = None
        elif quote.status == Quote.Status.PENDING_APPROVAL and (
            is_manager or quote.discount_percent <= threshold
        ):
            # Dropping discount below threshold releases the gate
            if quote.discount_percent <= threshold:
                quote.status = Quote.Status.DRAFT

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop("line_items", [])
        user = self.context["request"].user
        quote = Quote.objects.create(created_by=user, **validated_data)
        for line in lines:
            QuoteLineItem.objects.create(quote=quote, **line)
        self._apply_approval_gate(quote, user)
        quote.save()
        return quote

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop("line_items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if lines is not None:
            instance.line_items.all().delete()
            for line in lines:
                QuoteLineItem.objects.create(quote=instance, **line)
        self._apply_approval_gate(instance, self.context["request"].user)
        instance.save()
        return instance


class AiSuggestionSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = AiSuggestion
        fields = (
            "id",
            "kind",
            "opportunity",
            "lead",
            "title",
            "output_text",
            "output_json",
            "prompt_context",
            "provider",
            "model_name",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
