from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SDR = "SDR", "Sales Development"
        AE = "AE", "Account Executive"
        MANAGER = "MANAGER", "Sales Manager"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.AE)
    title = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    booking_slug = models.SlugField(max_length=64, blank=True, unique=True, null=True)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
