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
from apps.crm.models import (
    Account,
    Activity,
    Contact,
    DealComment,
    EmailTemplate,
    JobRun,
    Lead,
    Notification,
    Opportunity,
    Sequence,
    SequenceEnrollment,
    SequenceStep,
    Task,
)


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
            EmailTemplate.objects.all().delete()
            Task.objects.all().delete()
            DealComment.objects.all().delete()
            Notification.objects.all().delete()
            Activity.objects.all().delete()
            Opportunity.objects.all().delete()
            Contact.objects.all().delete()
            Account.objects.all().delete()
            Lead.objects.all().delete()
            JobRun.objects.all().delete()

        users = self._ensure_users()
        ensure_default_routing_rule()
        self._seed_leads(users["sdr"], users["ae"])
        self._seed_pipeline(users)
        self._seed_automation(users)
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
            ("Priya Shah", "priya@northwind.io", "Northwind Analytics", "VP Sales", Lead.Source.WEBSITE),
            ("Jon Lee", "jon@brightledger.com", "BrightLedger", "CTO", Lead.Source.OUTBOUND),
            ("Maya Chen", "maya@orbitops.co", "OrbitOps", "Head of RevOps", Lead.Source.REFERRAL),
            ("Diego Alvarez", "diego@stackform.dev", "Stackform", "Founder", Lead.Source.EVENT),
            ("Elena Rossi", "elena@copperhq.com", "CopperHQ", "Director IT", Lead.Source.WEBSITE),
            ("Chris Park", "chris@signalbay.io", "SignalBay", "CRO", Lead.Source.OUTBOUND),
        ]
        for name, email, company, title, source in samples:
            Lead.objects.create(
                name=name,
                email=email,
                company=company,
                title=title,
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
