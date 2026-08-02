"""
Seed demo users + realistic SaaS pipeline data.

Usage:
  python manage.py seed_demo
  python manage.py seed_demo --reset
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from random import choice, randint

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.automation import ensure_default_routing_rule
from apps.crm.deal_health import apply_deal_health
from apps.crm.models import (
    Account,
    Activity,
    AiSuggestion,
    AuditEvent,
    AvailabilitySlot,
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
from apps.crm.custom_fields import set_custom_fields
from apps.crm.ai_assists import generate_deal_summary, generate_next_action
from apps.crm.scoring import apply_lead_score


DEMO_PASSWORD = "demo1234"


class Command(BaseCommand):
    help = "Seed PipelineHQ demo users and sample CRM data"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Wipe CRM data before seeding")

    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("Resetting CRM tables…")
            SequenceEnrollment.objects.all().delete()
            SequenceStep.objects.all().delete()
            Sequence.objects.all().delete()
            QuoteLineItem.objects.all().delete()
            Quote.objects.all().delete()
            Product.objects.all().delete()
            CustomFieldValue.objects.all().delete()
            CustomFieldDefinition.objects.all().delete()
            AuditEvent.objects.all().delete()
            AiSuggestion.objects.all().delete()
            EmailMessage.objects.all().delete()
            EmailTemplate.objects.all().delete()
            Meeting.objects.all().delete()
            AvailabilitySlot.objects.all().delete()
            TimelineEvent.objects.all().delete()
            Task.objects.all().delete()
            DealComment.objects.all().delete()
            Notification.objects.all().delete()
            Activity.objects.all().delete()
            Opportunity.objects.all().delete()
            Contact.objects.all().delete()
            Account.objects.all().delete()
            Lead.objects.all().delete()
            LeadRoutingRule.objects.all().delete()
            Territory.objects.all().delete()
            JobRun.objects.all().delete()

        users = self._ensure_users()
        ensure_default_routing_rule()
        self._seed_leads(users["sdr"], users["ae"])
        self._seed_pipeline(users)
        self._seed_products_and_quotes(users)
        self._seed_platform(users)
        self._seed_ai_assists(users)
        self._seed_automation(users)
        self._seed_comms(users)
        self._refresh_scores_and_health()
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write("Logins (password for all: demo1234)")
        self.stdout.write("  sdr / ae / ae2 / manager")

    def _ensure_users(self):
        specs = [
            ("sdr", User.Role.SDR, "Sam", "Reed", "sdr@pipelinehq.local", "Sales Development"),
            ("ae", User.Role.AE, "Ava", "Ellis", "ae@pipelinehq.local", "Account Executive"),
            ("ae2", User.Role.AE, "Alex", "Ortiz", "ae2@pipelinehq.local", "Account Executive"),
            ("manager", User.Role.MANAGER, "Morgan", "Hale", "manager@pipelinehq.local", "Sales Manager"),
        ]
        users = {}
        for username, role, first, last, email, title in specs:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "role": role,
                    "first_name": first,
                    "last_name": last,
                    "email": email,
                    "title": title,
                    "is_staff": role == User.Role.MANAGER,
                },
            )
            user.role = role
            user.first_name = first
            user.last_name = last
            user.email = email
            user.title = title
            if not user.booking_slug:
                user.booking_slug = username
            user.set_password(DEMO_PASSWORD)
            user.save()
            users[username] = user
            self.stdout.write(f"{'Created' if created else 'Updated'} user {username} ({role})")
        return users

    def _seed_leads(self, sdr: User, ae: User):
        if Lead.objects.exists():
            self.stdout.write("Leads already present — skipping lead seed (use --reset).")
            return
        samples = [
            ("Priya Shah", "priya@northwind.io", "Northwind Analytics", "VP Sales", "Analytics", Lead.Source.WEBSITE),
            ("Jon Lee", "jon@brightledger.com", "BrightLedger", "CTO", "Fintech", Lead.Source.OUTBOUND),
            ("Maya Chen", "maya@orbitops.co", "OrbitOps", "Head of RevOps", "SaaS", Lead.Source.REFERRAL),
            ("Diego Alvarez", "diego@stackform.dev", "Stackform", "Founder", "Software", Lead.Source.EVENT),
            ("Elena Rossi", "elena@copperhq.com", "CopperHQ", "Director IT", "Cloud", Lead.Source.WEBSITE),
            ("Chris Park", "chris@signalbay.io", "SignalBay", "CRO", "SaaS", Lead.Source.OUTBOUND),
        ]
        for name, email, company, title, industry, source in samples:
            Lead.objects.create(
                name=name,
                email=email,
                company=company,
                title=title,
                industry=industry,
                source=source,
                status=choice([Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.QUALIFIED]),
                owner=sdr,
                notes="Seeded inbound/outbound lead.",
            )
        self.stdout.write(f"Created {len(samples)} leads for SDR.")

    def _seed_pipeline(self, users: dict[str, User]):
        if Opportunity.objects.exists():
            self.stdout.write("Opportunities already present — skipping pipeline seed (use --reset).")
            return

        ae = users["ae"]
        ae2 = users["ae2"]
        manager = users["manager"]

        companies = [
            ("Acme Cloud", "acmecloud.com", "SaaS", ae, "Jordan Blake", "jordan@acmecloud.com", "VP Eng"),
            ("Nimbus Pay", "nimbuspay.io", "Fintech", ae, "Riley Quinn", "riley@nimbuspay.io", "CFO"),
            ("Lattice AI", "lattice.ai", "AI", ae2, "Sam Ortiz", "sam@lattice.ai", "COO"),
            ("Harbor CRM", "harborcrm.com", "SaaS", ae2, "Taylor Kim", "taylor@harborcrm.com", "VP Sales"),
            ("Vertex Logs", "vertexlogs.dev", "DevTools", ae, "Casey Wu", "casey@vertexlogs.dev", "CTO"),
            ("Pulse Health", "pulsehealth.co", "Health", ae2, "Morgan Lee", "morgan@pulsehealth.co", "CIO"),
        ]
        stages = [
            Opportunity.Stage.DISCOVERY,
            Opportunity.Stage.DEMO,
            Opportunity.Stage.PROPOSAL,
            Opportunity.Stage.NEGOTIATION,
            Opportunity.Stage.CLOSED_WON,
            Opportunity.Stage.CLOSED_LOST,
        ]
        forecasts = [
            Opportunity.ForecastCategory.PIPELINE,
            Opportunity.ForecastCategory.BEST_CASE,
            Opportunity.ForecastCategory.COMMIT,
        ]

        today = timezone.localdate()
        opps: list[Opportunity] = []
        for i, (cname, domain, industry, owner, contact_name, contact_email, title) in enumerate(companies):
            account = Account.objects.create(
                name=cname,
                domain=domain,
                industry=industry,
                owner=owner,
            )
            contact = Contact.objects.create(
                account=account,
                name=contact_name,
                email=contact_email,
                title=title,
            )
            stage = stages[i % len(stages)]
            forecast = forecasts[i % len(forecasts)]
            if stage == Opportunity.Stage.CLOSED_WON:
                forecast = Opportunity.ForecastCategory.COMMIT
            meddic = {}
            if stage in {
                Opportunity.Stage.PROPOSAL,
                Opportunity.Stage.NEGOTIATION,
                Opportunity.Stage.CLOSED_WON,
            }:
                meddic = {
                    "identify_pain": "Manual forecasting eats 6+ hours weekly.",
                    "champion": contact_name,
                }
            if stage in {Opportunity.Stage.NEGOTIATION, Opportunity.Stage.CLOSED_WON}:
                meddic["economic_buyer"] = "CFO / VP Finance"
                meddic["metrics"] = "$180k productivity gain / year"
                meddic["decision_criteria"] = "Security, SSO, Salesforce sync"
                meddic["decision_process"] = "Champion → security review → CFO sign-off"
            if stage == Opportunity.Stage.CLOSED_WON:
                meddic["win_reason"] = "Best MEDDIC fit + faster time-to-value"
                meddic["closed_at"] = timezone.now() - timedelta(days=3)
            if stage == Opportunity.Stage.CLOSED_LOST:
                meddic["loss_reason"] = "Chose incumbent; timing slipped"
                meddic["closed_at"] = timezone.now() - timedelta(days=10)

            opp = Opportunity.objects.create(
                name=f"{cname} — Annual platform",
                account=account,
                primary_contact=contact,
                amount=Decimal(randint(12, 120) * 1000),
                stage=stage,
                close_date=today + timedelta(days=randint(7, 90)),
                forecast_category=forecast,
                next_step="Schedule technical deep-dive" if stage != Opportunity.Stage.CLOSED_LOST else "",
                owner=owner,
                stage_entered_at=timezone.now() - timedelta(days=randint(3, 40)),
                is_stale=(
                    i % 5 == 0
                    and stage
                    in {
                        Opportunity.Stage.DISCOVERY,
                        Opportunity.Stage.DEMO,
                        Opportunity.Stage.PROPOSAL,
                        Opportunity.Stage.NEGOTIATION,
                    }
                ),
                **meddic,
            )
            opps.append(opp)
            Activity.objects.create(
                opportunity=opp,
                type=Activity.Type.MEETING,
                subject="Discovery call",
                body="Discussed pain points and buying committee.",
                created_by=owner,
                completed=True,
            )
            if stage not in {Opportunity.Stage.CLOSED_WON, Opportunity.Stage.CLOSED_LOST}:
                Activity.objects.create(
                    opportunity=opp,
                    type=Activity.Type.CALL,
                    subject="Follow-up",
                    body="Confirm demo attendees.",
                    due_at=timezone.now() + timedelta(days=2),
                    created_by=owner,
                    completed=False,
                )

        # Deal comments + @mentions (notification for mentioned user)
        if len(opps) >= 2:
            DealComment.objects.create(
                opportunity=opps[0],
                author=ae,
                body="Just finished discovery — pain is clear. @manager worth a forecast bump?",
            )
            DealComment.objects.create(
                opportunity=opps[0],
                author=manager,
                body="Looks good @ae — fill champion before you push to Proposal.",
            )
            DealComment.objects.create(
                opportunity=opps[2],
                author=ae2,
                body="Security questionnaire landed. @ae can you share the SSO checklist?",
            )
            Notification.objects.create(
                user=manager,
                title="ae mentioned you",
                body="Just finished discovery — pain is clear. @manager worth a forecast bump?",
                kind=Notification.Kind.MENTION,
                link=f"/opportunities/{opps[0].id}",
            )
            Notification.objects.create(
                user=ae,
                title="manager mentioned you",
                body="Looks good @ae — fill champion before you push to Proposal.",
                kind=Notification.Kind.MENTION,
                link=f"/opportunities/{opps[0].id}",
            )

        # Tasks tied to open deals + overdue example
        open_opps = [o for o in opps if o.is_open]
        if open_opps:
            Task.objects.create(
                title="Send mutual action plan",
                description="Draft MAP for next executive meeting.",
                due_at=timezone.now() + timedelta(days=2),
                owner=open_opps[0].owner,
                opportunity=open_opps[0],
            )
            Task.objects.create(
                title="Prep demo environment",
                description="Sandbox with sample forecast data.",
                due_at=timezone.now() - timedelta(days=1),
                owner=open_opps[0].owner,
                opportunity=open_opps[0],
                completed=False,
            )
            if len(open_opps) > 1:
                Task.objects.create(
                    title="Confirm economic buyer meeting",
                    description="Lock CFO time on calendar.",
                    due_at=timezone.now() + timedelta(days=4),
                    owner=open_opps[1].owner,
                    opportunity=open_opps[1],
                )

        self.stdout.write(f"Created {len(companies)} accounts/opportunities with activities, comments, tasks.")

    def _seed_automation(self, users: dict[str, User]):
        if EmailTemplate.objects.exists():
            self.stdout.write("Automation data already present — skipping (use --reset).")
            return

        sdr = users["sdr"]
        manager = users["manager"]
        t1 = EmailTemplate.objects.create(
            name="Intro — value prop",
            subject="Quick idea for {{company}}",
            body="Hi {{name}},\n\nTeams like yours cut forecast busywork with PipelineHQ.\n\nWorth 15 minutes this week?",
            created_by=manager,
        )
        t2 = EmailTemplate.objects.create(
            name="Follow-up — social proof",
            subject="How {{company}} peers run pipeline",
            body="Hi {{name}},\n\nSharing a short case study from a similar SaaS team.\n\nHappy to walk through it.",
            created_by=manager,
        )
        seq = Sequence.objects.create(name="Outbound warm-up", is_active=True, created_by=manager)
        SequenceStep.objects.create(sequence=seq, order=1, delay_days=0, template=t1)
        SequenceStep.objects.create(sequence=seq, order=2, delay_days=2, template=t2)

        lead = Lead.objects.filter(owner=sdr).first()
        if lead:
            SequenceEnrollment.objects.create(
                sequence=seq,
                lead=lead,
                status=SequenceEnrollment.Status.ACTIVE,
                current_step_order=0,
                next_run_at=timezone.now() - timedelta(minutes=5),
                enrolled_by=sdr,
                last_message="Seeded — due for first step",
            )
            Task.objects.create(
                title="Call Priya — qualify budget",
                description="Confirm economic buyer before demo.",
                due_at=timezone.now() + timedelta(days=1),
                owner=sdr,
                lead=lead,
            )

        Notification.objects.create(
            user=sdr,
            title="Welcome to PipelineHQ",
            body="Lead routing, MEDDIC gates, and sequences are live. Check Tasks + Alerts.",
            kind=Notification.Kind.OTHER,
            link="/sequences",
        )
        Notification.objects.create(
            user=users["ae"],
            title="Fill MEDDIC before proposal",
            body="Stage gates require champion + pain before proposal.",
            kind=Notification.Kind.STAGE,
            link="/pipeline",
        )
        Notification.objects.create(
            user=manager,
            title="Demo workspace ready",
            body="Use Admin to manage the team, toggle lead routing, or reset demo data anytime.",
            kind=Notification.Kind.OTHER,
            link="/admin",
        )
        self.stdout.write("Seeded email templates, sequence, enrollment, tasks, notifications.")

    def _seed_comms(self, users: dict[str, User]):
        from datetime import time

        from apps.crm.email_tracking import new_tracking_token, text_to_html

        if AvailabilitySlot.objects.exists():
            self.stdout.write("Comms data already present — skipping (use --reset).")
            return

        ae = users["ae"]
        sdr = users["sdr"]
        for user in (ae, sdr):
            for weekday in range(0, 5):
                AvailabilitySlot.objects.create(
                    user=user,
                    weekday=weekday,
                    start_time=time(10, 0),
                    end_time=time(10, 30),
                )
                AvailabilitySlot.objects.create(
                    user=user,
                    weekday=weekday,
                    start_time=time(14, 0),
                    end_time=time(14, 30),
                )

        opp = Opportunity.objects.filter(owner=ae).first()
        lead = Lead.objects.filter(owner=sdr).first()
        if opp:
            Meeting.objects.create(
                host=ae,
                title="Discovery with primary contact",
                starts_at=timezone.now() + timedelta(days=1, hours=2),
                ends_at=timezone.now() + timedelta(days=1, hours=2, minutes=30),
                invitee_name="Demo Prospect",
                invitee_email="prospect@example.com",
                opportunity=opp,
            )
            token = new_tracking_token()
            EmailMessage.objects.create(
                to_email="prospect@example.com",
                subject="Thanks for the intro call",
                body_text="Looking forward to the next step.\n\nSee https://pipelinehq.local/demo",
                body_html=text_to_html(
                    "Looking forward to the next step.\n\nSee https://pipelinehq.local/demo"
                ),
                status=EmailMessage.Status.SENT,
                opportunity=opp,
                sent_by=ae,
                tracking_token=token,
                sent_at=timezone.now() - timedelta(hours=3),
                open_count=1,
                opened_at=timezone.now() - timedelta(hours=1),
            )
        if lead:
            Meeting.objects.create(
                host=sdr,
                title="Qualify call",
                starts_at=timezone.now() + timedelta(days=2, hours=1),
                ends_at=timezone.now() + timedelta(days=2, hours=1, minutes=30),
                invitee_name=lead.name,
                invitee_email=lead.email,
                lead=lead,
            )
        self.stdout.write("Seeded availability, meetings, sample tracked email.")

    def _seed_products_and_quotes(self, users: dict[str, User]):
        if Product.objects.exists():
            self.stdout.write("Products already present — skipping quotes seed (use --reset).")
            return

        ae = users["ae"]
        platform = Product.objects.create(
            name="PipelineHQ Platform",
            sku="PHQ-PLAT",
            description="Core CRM seats (annual)",
            unit_price=Decimal("12000.00"),
        )
        seats = Product.objects.create(
            name="Additional seats (10-pack)",
            sku="PHQ-SEAT10",
            description="Extra user seats",
            unit_price=Decimal("2400.00"),
        )
        success = Product.objects.create(
            name="Onboarding package",
            sku="PHQ-ONB",
            description="Implementation + training",
            unit_price=Decimal("5000.00"),
        )

        proposal_opps = list(
            Opportunity.objects.filter(
                stage__in=[Opportunity.Stage.PROPOSAL, Opportunity.Stage.NEGOTIATION]
            ).order_by("id")
        )
        if not proposal_opps:
            self.stdout.write("No proposal/negotiation deals — products only.")
            return

        q1 = Quote.objects.create(
            opportunity=proposal_opps[0],
            name=f"{proposal_opps[0].account.name} — Standard quote",
            status=Quote.Status.DRAFT,
            discount_percent=Decimal("10.00"),
            notes="Standard annual platform + seats.",
            created_by=ae,
        )
        QuoteLineItem.objects.create(
            quote=q1,
            product=platform,
            description=platform.name,
            quantity=Decimal("1"),
            unit_price=platform.unit_price,
        )
        QuoteLineItem.objects.create(
            quote=q1,
            product=seats,
            description=seats.name,
            quantity=Decimal("2"),
            unit_price=seats.unit_price,
        )

        if len(proposal_opps) > 1:
            q2 = Quote.objects.create(
                opportunity=proposal_opps[1],
                name=f"{proposal_opps[1].account.name} — Aggressive discount",
                status=Quote.Status.PENDING_APPROVAL,
                discount_percent=Decimal("28.00"),
                notes="Needs manager approval (>20%).",
                created_by=ae,
            )
            QuoteLineItem.objects.create(
                quote=q2,
                product=platform,
                description=platform.name,
                quantity=Decimal("1"),
                unit_price=platform.unit_price,
            )
            QuoteLineItem.objects.create(
                quote=q2,
                product=success,
                description=success.name,
                quantity=Decimal("1"),
                unit_price=success.unit_price,
            )
        else:
            q2 = Quote.objects.create(
                opportunity=proposal_opps[0],
                name=f"{proposal_opps[0].account.name} — Aggressive discount",
                status=Quote.Status.PENDING_APPROVAL,
                discount_percent=Decimal("28.00"),
                notes="Needs manager approval (>20%).",
                created_by=ae,
            )
            QuoteLineItem.objects.create(
                quote=q2,
                product=platform,
                description=platform.name,
                quantity=Decimal("1"),
                unit_price=platform.unit_price,
            )

        self.stdout.write(f"Seeded {Product.objects.count()} products and {Quote.objects.count()} quotes.")

    def _seed_platform(self, users: dict[str, User]):
        """Phase 4: territories, custom fields, sample values (audit grows via signals)."""
        west, _ = Territory.objects.get_or_create(
            name="West Coast",
            defaults={"region": "US-West", "industry": "SaaS", "is_active": True},
        )
        east, _ = Territory.objects.get_or_create(
            name="East Coast",
            defaults={"region": "US-East", "industry": "Fintech", "is_active": True},
        )
        west.members.set([users["sdr"], users["ae"], users["manager"]])
        east.members.set([users["ae2"], users["manager"]])

        # Assign some accounts to territories
        accounts = list(Account.objects.order_by("id")[:4])
        for i, account in enumerate(accounts):
            account.territory = west if i % 2 == 0 else east
            account.save(update_fields=["territory", "updated_at"])

        # Territory-aware routing rule
        LeadRoutingRule.objects.get_or_create(
            name="West Coast SDR routing",
            defaults={
                "enabled": True,
                "source": "",
                "strategy": LeadRoutingRule.Strategy.ROUND_ROBIN,
                "territory": west,
            },
        )

        defs = [
            (
                CustomFieldDefinition.Entity.LEAD,
                "budget_range",
                "Budget range",
                CustomFieldDefinition.FieldType.SELECT,
                ["<$10k", "$10k–50k", "$50k+"],
            ),
            (
                CustomFieldDefinition.Entity.LEAD,
                "use_case",
                "Primary use case",
                CustomFieldDefinition.FieldType.TEXT,
                [],
            ),
            (
                CustomFieldDefinition.Entity.ACCOUNT,
                "employee_count",
                "Employee count",
                CustomFieldDefinition.FieldType.NUMBER,
                [],
            ),
            (
                CustomFieldDefinition.Entity.CONTACT,
                "linkedin_url",
                "LinkedIn URL",
                CustomFieldDefinition.FieldType.TEXT,
                [],
            ),
            (
                CustomFieldDefinition.Entity.OPPORTUNITY,
                "competitor",
                "Primary competitor",
                CustomFieldDefinition.FieldType.SELECT,
                ["HubSpot", "Salesforce", "Pipedrive", "Other"],
            ),
            (
                CustomFieldDefinition.Entity.OPPORTUNITY,
                "renewal_date",
                "Renewal date",
                CustomFieldDefinition.FieldType.DATE,
                [],
            ),
        ]
        for entity, key, label, field_type, options in defs:
            CustomFieldDefinition.objects.get_or_create(
                entity=entity,
                key=key,
                defaults={
                    "label": label,
                    "field_type": field_type,
                    "options": options,
                    "is_active": True,
                },
            )

        lead = Lead.objects.order_by("id").first()
        if lead:
            set_custom_fields(
                "lead",
                lead.pk,
                {"budget_range": "$50k+", "use_case": "Outbound pipeline visibility"},
            )
        if accounts:
            set_custom_fields("account", accounts[0].pk, {"employee_count": 120})
        opp = Opportunity.objects.order_by("id").first()
        if opp:
            set_custom_fields(
                "opportunity",
                opp.pk,
                {"competitor": "HubSpot", "renewal_date": (timezone.now() + timedelta(days=180)).date().isoformat()},
            )

        self.stdout.write(
            f"Seeded {Territory.objects.count()} territories and "
            f"{CustomFieldDefinition.objects.count()} custom fields."
        )

    def _seed_ai_assists(self, users: dict[str, User]):
        if AiSuggestion.objects.exists():
            self.stdout.write("AI suggestions already present — skipping (use --reset).")
            return
        opp = (
            Opportunity.objects.filter(stage__in=[Opportunity.Stage.PROPOSAL, Opportunity.Stage.NEGOTIATION])
            .select_related("account", "primary_contact", "owner")
            .order_by("id")
            .first()
        )
        if not opp:
            opp = (
                Opportunity.objects.select_related("account", "primary_contact", "owner")
                .order_by("id")
                .first()
            )
        if not opp:
            self.stdout.write("No opportunities — skipping AI seed.")
            return
        generate_deal_summary(opp, user=users["manager"], use_llm=False)
        generate_next_action(opp, user=users["ae"], use_llm=False)
        self.stdout.write(f"Seeded {AiSuggestion.objects.count()} AI suggestions (rules).")

    def _refresh_scores_and_health(self):
        for lead in Lead.objects.all():
            apply_lead_score(lead, save=True)
        for opp in Opportunity.objects.all():
            apply_deal_health(opp, save=True)
        self.stdout.write("Refreshed lead scores and deal health.")
