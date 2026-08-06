from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="telegram-health"),
    path("auth/", views.auth, name="telegram-auth"),
    path("link/", views.link, name="telegram-link"),
    path("unlink/", views.unlink, name="telegram-unlink"),
]
