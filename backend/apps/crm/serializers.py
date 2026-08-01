from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer

from .automation import apply_closed_timestamp, notify_comment_mentions, validate_stage_transition
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
    SequenceStep,
    Task,
)


class AccountSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = Account
        fields = (
            "id",
            "name",
            "domain",
            "industry",
            "owner",
            "owner_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        return super().create(validated_data)


class ContactSerializer(serializers.ModelSerializer):
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


class DealCommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = DealComment
        fields = ("id", "opportunity", "author", "body", "created_at", "updated_at")
        read_only_fields = ("opportunity", "author", "created_at", "updated_at")

    def create(self, validated_data):
        comment = DealComment.objects.create(
            opportunity=validated_data["opportunity"],
            author=self.context["request"].user,
            body=validated_data["body"],
        )
        notify_comment_mentions(comment)
        return comment


class OpportunitySerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    account_name = serializers.CharField(source="account.name", read_only=True)
    activities = ActivitySerializer(many=True, read_only=True)
    comments = DealCommentSerializer(many=True, read_only=True)
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
        read_only_fields = ("is_stale", "closed_at", "created_at", "updated_at")

    def get_meddic_checklist(self, obj):
        return obj.meddic_checklist()

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and "stage" in attrs:
            validate_stage_transition(instance, attrs["stage"], attrs)
        return attrs

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_stage = validated_data.get("stage", instance.stage)
        apply_closed_timestamp(instance, new_stage)
        if "closed_at" not in validated_data:
            validated_data["closed_at"] = instance.closed_at
        return super().update(instance, validated_data)


class OpportunityListSerializer(OpportunitySerializer):
    class Meta(OpportunitySerializer.Meta):
        fields = tuple(
            f for f in OpportunitySerializer.Meta.fields if f not in {"activities", "comments"}
        )


class LeadSerializer(serializers.ModelSerializer):
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
            "status",
            "source",
            "notes",
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
            "converted_account",
            "converted_contact",
            "converted_opportunity",
            "converted_at",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
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
    lead_name = serializers.CharField(source="lead.name", read_only=True, default=None)
    opportunity_name = serializers.CharField(source="opportunity.name", read_only=True, default=None)

    class Meta:
        model = Task
        fields = (
            "id",
            "title",
            "description",
            "due_at",
            "completed",
            "completed_at",
            "owner",
            "owner_id",
            "lead",
            "lead_name",
            "opportunity",
            "opportunity_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("completed_at", "created_at", "updated_at")

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        completed = validated_data.get("completed", instance.completed)
        if completed and not instance.completed:
            validated_data["completed_at"] = timezone.now()
        elif not completed:
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

    class Meta:
        model = LeadRoutingRule
        fields = (
            "id",
            "name",
            "enabled",
            "source",
            "strategy",
            "last_assignee",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("strategy", "created_at", "updated_at")


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
    template_name = serializers.CharField(source="template.name", read_only=True)
    template_subject = serializers.CharField(source="template.subject", read_only=True)

    class Meta:
        model = SequenceStep
        fields = (
            "id",
            "sequence",
            "order",
            "delay_days",
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

    class Meta:
        model = Sequence
        fields = (
            "id",
            "name",
            "is_active",
            "created_by",
            "steps",
            "step_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_step_count(self, obj):
        return obj.steps.count()

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class SequenceEnrollmentSerializer(serializers.ModelSerializer):
    sequence_name = serializers.CharField(source="sequence.name", read_only=True)
    lead_name = serializers.CharField(source="lead.name", read_only=True)
    lead_company = serializers.CharField(source="lead.company", read_only=True)
    enrolled_by = UserSerializer(read_only=True)

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
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "current_step_order",
            "next_run_at",
            "enrolled_by",
            "last_message",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        sequence = attrs.get("sequence") or getattr(self.instance, "sequence", None)
        lead = attrs.get("lead") or getattr(self.instance, "lead", None)
        if sequence and not sequence.is_active:
            raise serializers.ValidationError({"sequence": "Sequence is not active."})
        if sequence and not sequence.steps.exists():
            raise serializers.ValidationError({"sequence": "Sequence has no steps."})
        if (
            self.instance is None
            and sequence
            and lead
            and SequenceEnrollment.objects.filter(sequence=sequence, lead=lead).exists()
        ):
            raise serializers.ValidationError("Lead is already enrolled in this sequence.")
        return attrs

    def create(self, validated_data):
        sequence = validated_data["sequence"]
        first_step = sequence.steps.order_by("order").first()
        delay = first_step.delay_days if first_step else 0
        validated_data["enrolled_by"] = self.context["request"].user
        validated_data["status"] = SequenceEnrollment.Status.ACTIVE
        validated_data["current_step_order"] = 0
        validated_data["next_run_at"] = timezone.now() + timedelta(days=delay)
        validated_data["last_message"] = "Enrolled — waiting for first step"
        return super().create(validated_data)
