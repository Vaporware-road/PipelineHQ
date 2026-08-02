# Generated manually for meeting bulk invitee emails + All roles target

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0010_ux_overhaul_leads_tasks_comments_calendar_sequences"),
    ]

    operations = [
        migrations.AlterField(
            model_name="meeting",
            name="invitee_email",
            field=models.TextField(),
        ),
        migrations.AlterField(
            model_name="meeting",
            name="target_role",
            field=models.CharField(
                blank=True,
                choices=[
                    ("SDR", "Sales Development"),
                    ("AE", "Account Executive"),
                    ("MANAGER", "Sales Manager"),
                    ("ALL", "All roles"),
                ],
                max_length=20,
            ),
        ),
    ]
