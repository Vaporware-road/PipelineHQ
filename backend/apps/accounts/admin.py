from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "role", "title", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    fieldsets = DjangoUserAdmin.fieldsets + (("CRM", {"fields": ("role", "title", "phone", "booking_slug")}),)
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (("CRM", {"fields": ("role", "title", "phone", "booking_slug")}),)
