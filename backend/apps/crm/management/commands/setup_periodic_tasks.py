"""Register Celery Beat periodic tasks in the database."""

from django.core.management.base import BaseCommand
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Ensure Celery Beat schedules exist for stale-deal scan, cache warm, sequences, tasks"

    def handle(self, *args, **options):
        hourly, _ = IntervalSchedule.objects.get_or_create(every=1, period=IntervalSchedule.HOURS)
        nightly, _ = CrontabSchedule.objects.get_or_create(
            minute="0",
            hour="2",
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone="UTC",
        )

        PeriodicTask.objects.update_or_create(
            name="Flag stale deals hourly",
            defaults={
                "interval": hourly,
                "crontab": None,
                "task": "crm.flag_stale_deals",
                "enabled": True,
            },
        )
        PeriodicTask.objects.update_or_create(
            name="Warm dashboard cache nightly",
            defaults={
                "crontab": nightly,
                "interval": None,
                "task": "crm.warm_dashboard_cache",
                "enabled": True,
            },
        )
        PeriodicTask.objects.update_or_create(
            name="Advance email sequences hourly",
            defaults={
                "interval": hourly,
                "crontab": None,
                "task": "crm.advance_sequence_enrollments",
                "enabled": True,
            },
        )
        PeriodicTask.objects.update_or_create(
            name="Notify overdue tasks hourly",
            defaults={
                "interval": hourly,
                "crontab": None,
                "task": "crm.notify_overdue_tasks",
                "enabled": True,
            },
        )
        self.stdout.write(self.style.SUCCESS("Periodic tasks registered."))
