from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("SDR", "Sales Development"),
                    ("AE", "Account Executive"),
                    ("MANAGER", "Sales Manager"),
                ],
                default="AE",
                max_length=20,
            ),
        ),
    ]
