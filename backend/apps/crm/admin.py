from django.contrib import admin

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


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "status", "source", "owner", "created_at")
    list_filter = ("status", "source", "owner")
    search_fields = ("name", "email", "company")


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "domain", "industry", "owner")
    search_fields = ("name", "domain")


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "title", "account")
    search_fields = ("name", "email")


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("name", "account", "amount", "stage", "forecast_category", "owner", "is_stale")
    list_filter = ("stage", "forecast_category", "is_stale", "owner")
    search_fields = ("name", "account__name")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("subject", "type", "opportunity", "created_by", "completed", "created_at")
    list_filter = ("type", "completed")


@admin.register(DealComment)
class DealCommentAdmin(admin.ModelAdmin):
    list_display = ("opportunity", "author", "created_at")
    search_fields = ("body", "author__username", "opportunity__name")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "due_at", "completed", "lead", "opportunity")
    list_filter = ("completed",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")


@admin.register(LeadRoutingRule)
class LeadRoutingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "enabled", "source", "strategy", "last_assignee")


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "created_by")


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
