from django.contrib import admin

from .models import (
    Account,
    Activity,
    AiSuggestion,
    AuditEvent,
    AvailabilitySlot,
    Comment,
    Contact,
    CustomFieldDefinition,
    CustomFieldValue,
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
    SequenceStep,
    Task,
    Territory,
    TimelineEvent,
)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "status", "priority", "budget_amount", "source", "score", "owner", "created_at")
    list_filter = ("status", "priority", "source", "owner")
    search_fields = ("name", "email", "company")


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "domain", "industry", "territory", "owner")
    list_filter = ("territory", "industry")
    search_fields = ("name", "domain")


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "title", "account")
    search_fields = ("name", "email")


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("name", "account", "amount", "stage", "health", "forecast_category", "owner", "is_stale")
    list_filter = ("stage", "health", "forecast_category", "is_stale", "owner")
    search_fields = ("name", "account__name")


@admin.register(Territory)
class TerritoryAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "industry", "is_active")
    list_filter = ("is_active", "region")
    search_fields = ("name", "region", "industry")
    filter_horizontal = ("members",)


@admin.register(CustomFieldDefinition)
class CustomFieldDefinitionAdmin(admin.ModelAdmin):
    list_display = ("entity", "key", "label", "field_type", "required", "is_active")
    list_filter = ("entity", "field_type", "is_active")
    search_fields = ("key", "label")


@admin.register(CustomFieldValue)
class CustomFieldValueAdmin(admin.ModelAdmin):
    list_display = ("definition", "entity_type", "entity_id", "value_text", "value_number")
    list_filter = ("entity_type",)


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("action", "entity_type", "entity_id", "entity_label", "actor", "occurred_at")
    list_filter = ("action", "entity_type")
    search_fields = ("entity_label",)
    readonly_fields = (
        "actor",
        "action",
        "entity_type",
        "entity_id",
        "entity_label",
        "changes",
        "occurred_at",
    )


@admin.register(AiSuggestion)
class AiSuggestionAdmin(admin.ModelAdmin):
    list_display = ("kind", "title", "provider", "opportunity", "lead", "created_at")
    list_filter = ("kind", "provider")
    search_fields = ("title", "output_text")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "unit_price", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "sku")


class QuoteLineItemInline(admin.TabularInline):
    model = QuoteLineItem
    extra = 0


@admin.register(Quote)
class QuoteAdmin(admin.ModelAdmin):
    list_display = ("name", "opportunity", "status", "discount_percent", "created_by", "updated_at")
    list_filter = ("status",)
    search_fields = ("name", "opportunity__name")
    inlines = [QuoteLineItemInline]


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("subject", "type", "opportunity", "created_by", "completed", "created_at")
    list_filter = ("type", "completed")


@admin.register(DealComment)
class DealCommentAdmin(admin.ModelAdmin):
    list_display = ("opportunity", "author", "created_at")
    search_fields = ("body", "author__username", "opportunity__name")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("author", "opportunity", "lead", "task", "meeting", "created_at")
    search_fields = ("body", "author__username")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "created_by", "status", "priority", "due_at", "completed", "lead", "opportunity")
    list_filter = ("completed", "status", "priority")


@admin.register(TimelineEvent)
class TimelineEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "title", "entity_type", "entity_id", "occurred_at")
    list_filter = ("event_type", "entity_type")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")


@admin.register(LeadRoutingRule)
class LeadRoutingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "enabled", "source", "strategy", "territory", "last_assignee")
    list_filter = ("enabled", "territory")


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "created_by")


@admin.register(EmailMessage)
class EmailMessageAdmin(admin.ModelAdmin):
    list_display = ("subject", "to_email", "status", "sent_by", "open_count", "click_count", "sent_at")
    list_filter = ("status",)
    search_fields = ("subject", "to_email", "tracking_token")


@admin.register(AvailabilitySlot)
class AvailabilitySlotAdmin(admin.ModelAdmin):
    list_display = ("user", "weekday", "start_time", "end_time")
    list_filter = ("weekday",)


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ("title", "host", "starts_at", "invitee_name", "target_role", "status")
    list_filter = ("status", "target_role")


class SequenceStepInline(admin.TabularInline):
    model = SequenceStep
    extra = 0


@admin.register(Sequence)
class SequenceAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_by")
    inlines = [SequenceStepInline]


@admin.register(SequenceEnrollment)
class SequenceEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("lead", "sequence", "status", "current_step_order", "next_run_at")
    list_filter = ("status",)


@admin.register(JobRun)
class JobRunAdmin(admin.ModelAdmin):
    list_display = ("type", "status", "requested_by", "celery_task_id", "created_at")
    list_filter = ("type", "status")
