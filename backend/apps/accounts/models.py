from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SDR = "SDR", "SDR"
        AE = "AE", "Account Executive"
        MANAGER = "MANAGER", "Sales Manager"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.AE)

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
