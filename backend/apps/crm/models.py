from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Lead(TimeStampedModel):
    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUALIFIED = "qualified", "Qualified"
        DISQUALIFIED = "disqualified", "Disqualified"
        CONVERTED = "converted", "Converted"

    class Source(models.TextChoices):
        WEBSITE = "website", "Website"
        REFERRAL = "referral", "Referral"
        OUTBOUND = "outbound", "Outbound"
        EVENT = "event", "Event"
        OTHER = "other", "Other"

    name = models.CharField(max_length=200)
    email = models.EmailField()
    company = models.CharField(max_length=200)
    title = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.WEBSITE)
    notes = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="leads",
    )
    converted_account = models.ForeignKey(
        "Account",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_leads",
    )
    converted_contact = models.ForeignKey(
        "Contact",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_leads",
    )
    converted_opportunity = models.ForeignKey(
        "Opportunity",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_leads",
    )
    converted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} @ {self.company}"


class Account(TimeStampedModel):
    name = models.CharField(max_length=200)
    domain = models.CharField(max_length=200, blank=True)
    industry = models.CharField(max_length=120, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="accounts",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Contact(TimeStampedModel):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="contacts")
    name = models.CharField(max_length=200)
    email = models.EmailField()
    title = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Opportunity(TimeStampedModel):
    class Stage(models.TextChoices):
        DISCOVERY = "discovery", "Discovery"
        DEMO = "demo", "Demo"
        PROPOSAL = "proposal", "Proposal"
        NEGOTIATION = "negotiation", "Negotiation"
        CLOSED_WON = "closed_won", "Closed Won"
        CLOSED_LOST = "closed_lost", "Closed Lost"

    class ForecastCategory(models.TextChoices):
        PIPELINE = "pipeline", "Pipeline"
        BEST_CASE = "best_case", "Best Case"
        COMMIT = "commit", "Commit"

    name = models.CharField(max_length=200)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="opportunities")
    primary_contact = models.ForeignKey(
        Contact,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="opportunities",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.DISCOVERY)
    close_date = models.DateField(default=timezone.localdate)
    forecast_category = models.CharField(
        max_length=20,
        choices=ForecastCategory.choices,
        default=ForecastCategory.PIPELINE,
    )
    next_step = models.CharField(max_length=255, blank=True)
    is_stale = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="opportunities",
    )
    # MEDDIC qualification checklist (optional until stage gates require them)
    metrics = models.TextField(blank=True)
    economic_buyer = models.CharField(max_length=255, blank=True)
    decision_criteria = models.TextField(blank=True)
    decision_process = models.TextField(blank=True)
    identify_pain = models.TextField(blank=True)
    champion = models.CharField(max_length=255, blank=True)
    win_reason = models.TextField(blank=True)
    loss_reason = models.TextField(blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name_plural = "opportunities"

    def __str__(self) -> str:
        return self.name

    @property
    def is_open(self) -> bool:
        return self.stage not in {self.Stage.CLOSED_WON, self.Stage.CLOSED_LOST}

    def meddic_checklist(self) -> dict[str, bool]:
        return {
            "metrics": bool(self.metrics.strip()),
            "economic_buyer": bool(self.economic_buyer.strip()),
            "decision_criteria": bool(self.decision_criteria.strip()),
            "decision_process": bool(self.decision_process.strip()),
            "identify_pain": bool(self.identify_pain.strip()),
            "champion": bool(self.champion.strip()),
        }


class Activity(TimeStampedModel):
    class Type(models.TextChoices):
        CALL = "call", "Call"
        EMAIL = "email", "Email"
        MEETING = "meeting", "Meeting"
        NOTE = "note", "Note"

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="activities")
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.NOTE)
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="activities",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activities"

    def __str__(self) -> str:
        return f"{self.type}: {self.subject}"


class DealComment(TimeStampedModel):
    """Threaded-style notes on an opportunity; body may include @username mentions."""

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="deal_comments",
    )
    body = models.TextField()

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Comment on {self.opportunity_id} by {self.author_id}"


class Task(TimeStampedModel):
    """Reminders / to-dos tied to a lead or opportunity (also used by email sequences)."""

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    lead = models.ForeignKey(
        Lead,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    opportunity = models.ForeignKey(
        Opportunity,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tasks",
    )

    class Meta:
        ordering = ["completed", "due_at", "-created_at"]

    def __str__(self) -> str:
        return self.title


class Notification(TimeStampedModel):
    class Kind(models.TextChoices):
        ASSIGNMENT = "assignment", "Assignment"
        MENTION = "mention", "Mention"
        TASK_DUE = "task_due", "Task Due"
        SEQUENCE = "sequence", "Sequence"
        STAGE = "stage", "Stage"
        OTHER = "other", "Other"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.OTHER)
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} → {self.user_id}"


class LeadRoutingRule(TimeStampedModel):
    """Auto-assign new leads to SDRs (round-robin), optionally filtered by source."""

    class Strategy(models.TextChoices):
        ROUND_ROBIN = "round_robin", "Round robin"

    name = models.CharField(max_length=120, default="Default routing")
    enabled = models.BooleanField(default=True)
    source = models.CharField(
        max_length=20,
        choices=Lead.Source.choices,
        blank=True,
        help_text="Blank = apply to all sources",
    )
    strategy = models.CharField(
        max_length=20,
        choices=Strategy.choices,
        default=Strategy.ROUND_ROBIN,
    )
    last_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="routing_rules_last",
    )

    class Meta:
        ordering = ["-enabled", "name"]

    def __str__(self) -> str:
        return self.name


class EmailTemplate(TimeStampedModel):
    name = models.CharField(max_length=120)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="email_templates",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Sequence(TimeStampedModel):
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sequences",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class SequenceStep(TimeStampedModel):
    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveIntegerField(default=1)
    delay_days = models.PositiveIntegerField(default=0)
    template = models.ForeignKey(
        EmailTemplate,
        on_delete=models.PROTECT,
        related_name="sequence_steps",
    )

    class Meta:
        ordering = ["sequence_id", "order"]
        unique_together = [("sequence", "order")]

    def __str__(self) -> str:
        return f"{self.sequence.name} step {self.order}"


class SequenceEnrollment(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name="enrollments")
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="sequence_enrollments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    current_step_order = models.PositiveIntegerField(default=0)
    next_run_at = models.DateTimeField(null=True, blank=True)
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sequence_enrollments",
    )
    last_message = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("sequence", "lead")]

    def __str__(self) -> str:
        return f"{self.lead_id} in {self.sequence_id} ({self.status})"


class JobRun(TimeStampedModel):
    class Type(models.TextChoices):
        LEAD_IMPORT = "lead_import", "Lead Import"
        FORECAST_EXPORT = "forecast_export", "Forecast Export"
        ANALYTICS_EXPORT = "analytics_export", "Analytics Export"
        DEMO_RESET = "demo_reset", "Demo Reset"
        STALE_SCAN = "stale_scan", "Stale Deal Scan"
        CACHE_WARM = "cache_warm", "Cache Warm"
        SEQUENCE_ADVANCE = "sequence_advance", "Sequence Advance"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    type = models.CharField(max_length=40, choices=Type.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="job_runs",
    )
    celery_task_id = models.CharField(max_length=255, blank=True)
    message = models.TextField(blank=True)
    result_meta = models.JSONField(default=dict, blank=True)
    result_file = models.FileField(upload_to="exports/", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.type} ({self.status})"
