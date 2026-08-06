from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "role", "title", "telegram_id", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    search_fields = ("username", "email", "first_name", "last_name", "telegram_id")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("CRM", {"fields": ("role", "title", "phone", "booking_slug", "telegram_id")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("CRM", {"fields": ("role", "title", "phone", "booking_slug", "telegram_id")}),
    )
