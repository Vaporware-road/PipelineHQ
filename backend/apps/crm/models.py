from django.conf import settings
from django.db import models
from django.utils import timezone
from decimal import Decimal


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

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    name = models.CharField(max_length=200)
    email = models.EmailField()
    company = models.CharField(max_length=200)
    title = models.CharField(max_length=120, blank=True)
    industry = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.WEBSITE)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    budget_amount = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Budget in USD dollars; UI slider starts at 1000.",
    )
    notes = models.TextField(blank=True)
    score = models.PositiveSmallIntegerField(default=0)
    score_reasons = models.JSONField(default=list, blank=True)
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
    territory = models.ForeignKey(
        "Territory",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
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

    class Health(models.TextChoices):
        HEALTHY = "healthy", "Healthy"
        AT_RISK = "at_risk", "At risk"
        STALLED = "stalled", "Stalled"

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
    stage_entered_at = models.DateTimeField(null=True, blank=True)
    health = models.CharField(max_length=20, choices=Health.choices, default=Health.HEALTHY)
    health_reasons = models.JSONField(default=list, blank=True)
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
    """Deprecated: use Comment. Kept for migration compatibility until data is copied."""

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="legacy_comments")
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
    """Reminders / to-dos tied to a lead or opportunity."""

    class Status(models.TextChoices):
        TODO = "todo", "To do"
        IN_PROGRESS = "in_progress", "In progress"
        BLOCKED = "blocked", "Blocked"
        DONE = "done", "Done"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tasks_created",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
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

    def save(self, *args, **kwargs):
        if self.completed and self.status != self.Status.DONE:
            self.status = self.Status.DONE
        if self.status == self.Status.DONE:
            self.completed = True
            if not self.completed_at:
                self.completed_at = timezone.now()
        else:
            self.completed = False
            self.completed_at = None
        super().save(*args, **kwargs)


class Comment(TimeStampedModel):
    """Polymorphic threaded comments; body may include @ROLE and @@username mentions."""

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="crm_comments",
    )
    body = models.TextField()
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )
    opportunity = models.ForeignKey(
        Opportunity,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    lead = models.ForeignKey(
        Lead,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    task = models.ForeignKey(
        Task,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    meeting = models.ForeignKey(
        "Meeting",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="comments",
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Comment by {self.author_id}"

    def mention_link(self) -> str:
        if self.opportunity_id:
            return f"/opportunities/{self.opportunity_id}"
        if self.lead_id:
            return f"/leads/{self.lead_id}"
        if self.task_id:
            return f"/tasks/{self.task_id}"
        if self.meeting_id:
            return "/calendar"
        return ""


class TimelineEvent(TimeStampedModel):
    class EntityType(models.TextChoices):
        LEAD = "lead", "Lead"
        ACCOUNT = "account", "Account"
        CONTACT = "contact", "Contact"
        OPPORTUNITY = "opportunity", "Opportunity"

    class EventType(models.TextChoices):
        STAGE_CHANGE = "stage_change", "Stage change"
        STATUS_CHANGE = "status_change", "Status change"
        CREATED = "created", "Created"
        MERGED = "merged", "Merged"
        NOTE = "note", "Note"
        EMAIL_SENT = "email_sent", "Email sent"
        EMAIL_OPEN = "email_open", "Email open"
        EMAIL_CLICK = "email_click", "Email click"
        MEETING = "meeting", "Meeting"
        OTHER = "other", "Other"

    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    entity_id = models.PositiveIntegerField()
    event_type = models.CharField(max_length=30, choices=EventType.choices, default=EventType.OTHER)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    meta = models.JSONField(blank=True, default=dict)
    occurred_at = models.DateTimeField(default=timezone.now)
    account = models.ForeignKey(
        "Account",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="timeline_events",
    )
    contact = models.ForeignKey(
        "Contact",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="timeline_events",
    )
    lead = models.ForeignKey(
        "Lead",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="timeline_events",
    )
    opportunity = models.ForeignKey(
        "Opportunity",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="timeline_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="timeline_events",
    )

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "-occurred_at"]),
            models.Index(fields=["account", "-occurred_at"]),
            models.Index(fields=["contact", "-occurred_at"]),
            models.Index(fields=["lead", "-occurred_at"]),
            models.Index(fields=["opportunity", "-occurred_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type}: {self.title}"


class Notification(TimeStampedModel):
    class Kind(models.TextChoices):
        ASSIGNMENT = "assignment", "Assignment"
        MENTION = "mention", "Mention"
        TASK_DUE = "task_due", "Task Due"
        SEQUENCE = "sequence", "Sequence"
        STAGE = "stage", "Stage"
        EMAIL = "email", "Email"
        EMAIL_OPEN = "email_open", "Email open"
        EMAIL_CLICK = "email_click", "Email click"
        MEETING = "meeting", "Meeting"
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
    """Auto-assign new leads to SDRs (round-robin), optionally filtered by source/territory."""

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
    territory = models.ForeignKey(
        "Territory",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="routing_rules",
        help_text="When set, round-robin only among SDRs in this territory",
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
    description = models.TextField(blank=True)
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
    class StepType(models.TextChoices):
        EMAIL = "email", "Email"

    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveIntegerField(default=1)
    delay_days = models.PositiveIntegerField(default=0)
    step_type = models.CharField(max_length=20, choices=StepType.choices, default=StepType.EMAIL)
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
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [("sequence", "lead")]

    def __str__(self) -> str:
        return f"{self.lead_id} in {self.sequence_id} ({self.status})"


class EmailMessage(TimeStampedModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    to_email = models.EmailField()
    subject = models.CharField(max_length=255)
    body_text = models.TextField(blank=True)
    body_html = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    lead = models.ForeignKey(
        Lead,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_messages",
    )
    contact = models.ForeignKey(
        Contact,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_messages",
    )
    opportunity = models.ForeignKey(
        Opportunity,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_messages",
    )
    enrollment = models.ForeignKey(
        SequenceEnrollment,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_messages",
    )
    template = models.ForeignKey(
        EmailTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_messages",
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_emails",
    )
    tracking_token = models.CharField(max_length=64, unique=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    open_count = models.PositiveIntegerField(default=0)
    clicked_at = models.DateTimeField(null=True, blank=True)
    click_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.subject} → {self.to_email} ({self.status})"


class AvailabilitySlot(TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availability_slots",
    )
    weekday = models.PositiveSmallIntegerField(help_text="0=Monday … 6=Sunday")
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["user_id", "weekday", "start_time"]
        unique_together = [("user", "weekday", "start_time", "end_time")]

    def __str__(self) -> str:
        return f"{self.user_id} wd{self.weekday} {self.start_time}-{self.end_time}"


class Meeting(TimeStampedModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"

    class TargetRole(models.TextChoices):
        SDR = "SDR", "Sales Development"
        AE = "AE", "Account Executive"
        MANAGER = "MANAGER", "Sales Manager"
        ALL = "ALL", "All roles"

    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hosted_meetings",
    )
    title = models.CharField(max_length=255, default="Meeting")
    job_detail = models.TextField(blank=True)
    target_role = models.CharField(max_length=20, choices=TargetRole.choices, blank=True)
    mentioned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="mentioned_in_meetings",
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    invitee_name = models.CharField(max_length=200)
    # One or more emails (comma / newline / semicolon separated).
    invitee_email = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    lead = models.ForeignKey(
        Lead,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="meetings",
    )
    contact = models.ForeignKey(
        Contact,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="meetings",
    )
    opportunity = models.ForeignKey(
        Opportunity,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="meetings",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["starts_at"]

    def __str__(self) -> str:
        return f"{self.title} @ {self.starts_at}"


class Product(TimeStampedModel):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=64, blank=True)
    description = models.TextField(blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Quote(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_APPROVAL = "pending_approval", "Pending approval"
        SENT = "sent", "Sent"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name="quotes")
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="quotes_created",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quotes_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.status})"

    @property
    def subtotal(self):
        total = Decimal("0")
        for line in self.line_items.all():
            total += line.line_total
        return total

    @property
    def total(self):
        discount = self.discount_percent or Decimal("0")
        factor = (Decimal("100") - discount) / Decimal("100")
        return (self.subtotal * factor).quantize(Decimal("0.01"))

    @property
    def needs_approval(self) -> bool:
        threshold = Decimal(str(getattr(settings, "QUOTE_DISCOUNT_APPROVAL_PCT", 20)))
        return (self.discount_percent or Decimal("0")) > threshold


class QuoteLineItem(TimeStampedModel):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="line_items")
    product = models.ForeignKey(
        Product,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="quote_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.description

    @property
    def line_total(self):
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"))

class Territory(TimeStampedModel):
    """Sales region or industry slice — users and accounts can belong to one."""

    name = models.CharField(max_length=120)
    region = models.CharField(max_length=120, blank=True)
    industry = models.CharField(
        max_length=120,
        blank=True,
        help_text="Optional industry match hint for routing/assignment",
    )
    is_active = models.BooleanField(default=True)
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="territories",
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "territories"

    def __str__(self) -> str:
        return self.name


class CustomFieldDefinition(TimeStampedModel):
    """EAV field schema — managers define fields per CRM entity."""

    class Entity(models.TextChoices):
        LEAD = "lead", "Lead"
        ACCOUNT = "account", "Account"
        CONTACT = "contact", "Contact"
        OPPORTUNITY = "opportunity", "Opportunity"

    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        BOOL = "bool", "Boolean"
        SELECT = "select", "Select"
        DATE = "date", "Date"

    entity = models.CharField(max_length=20, choices=Entity.choices)
    key = models.SlugField(max_length=64)
    label = models.CharField(max_length=120)
    field_type = models.CharField(max_length=20, choices=FieldType.choices, default=FieldType.TEXT)
    options = models.JSONField(
        default=list,
        blank=True,
        help_text="Select options as a list of strings",
    )
    required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["entity", "label"]
        unique_together = [("entity", "key")]

    def __str__(self) -> str:
        return f"{self.entity}.{self.key}"


class CustomFieldValue(TimeStampedModel):
    """Stored value for a CustomFieldDefinition on one entity instance."""

    definition = models.ForeignKey(
        CustomFieldDefinition,
        on_delete=models.CASCADE,
        related_name="values",
    )
    entity_type = models.CharField(max_length=20, choices=CustomFieldDefinition.Entity.choices)
    entity_id = models.PositiveIntegerField()
    value_text = models.TextField(blank=True)
    value_number = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    value_bool = models.BooleanField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["definition__label"]
        unique_together = [("definition", "entity_type", "entity_id")]
        indexes = [
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["definition", "value_text"]),
        ]

    def __str__(self) -> str:
        return f"{self.definition_id}@{self.entity_type}:{self.entity_id}"


class AuditEvent(models.Model):
    """Append-only change history for manager compliance views."""

    class Action(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        STAGE = "stage", "Stage change"
        OWNER = "owner", "Owner change"
        STATUS = "status", "Status change"

    class EntityType(models.TextChoices):
        LEAD = "lead", "Lead"
        ACCOUNT = "account", "Account"
        CONTACT = "contact", "Contact"
        OPPORTUNITY = "opportunity", "Opportunity"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    entity_type = models.CharField(max_length=20, choices=EntityType.choices)
    entity_id = models.PositiveIntegerField()
    entity_label = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "-occurred_at"]),
            models.Index(fields=["actor", "-occurred_at"]),
            models.Index(fields=["action", "-occurred_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} {self.entity_type}:{self.entity_id}"


class AiSuggestion(TimeStampedModel):
    """Cached AI / rules assist output for demo replay without live LLM calls."""

    class Kind(models.TextChoices):
        SUMMARY = "summary", "Deal summary"
        NEXT_ACTION = "next_action", "Next-best action"
        EMAIL_DRAFT = "email_draft", "Email draft"
        SCORE_OVERLAY = "score_overlay", "Lead score overlay"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    opportunity = models.ForeignKey(
        Opportunity,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ai_suggestions",
    )
    lead = models.ForeignKey(
        Lead,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ai_suggestions",
    )
    title = models.CharField(max_length=255, blank=True)
    output_text = models.TextField(blank=True)
    output_json = models.JSONField(default=dict, blank=True)
    prompt_context = models.JSONField(default=dict, blank=True)
    provider = models.CharField(max_length=40, default="rules")
    model_name = models.CharField(max_length=80, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="ai_suggestions",
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["opportunity", "kind", "-created_at"]),
            models.Index(fields=["lead", "kind", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind} ({self.provider})"


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
