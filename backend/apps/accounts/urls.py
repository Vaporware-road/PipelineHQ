from django.urls import path

from .views import DemoLoginView, MeView, TeamView

urlpatterns = [
    path("me/", MeView.as_view(), name="auth-me"),
    path("team/", TeamView.as_view(), name="auth-team"),
    path("demo-login/", DemoLoginView.as_view(), name="auth-demo-login"),
]
