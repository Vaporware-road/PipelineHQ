from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ChangePasswordView, DemoLoginView, MeSummaryView, MeView, TeamView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="auth-user")

urlpatterns = [
    path("me/", MeView.as_view(), name="auth-me"),
    path("me/summary/", MeSummaryView.as_view(), name="auth-me-summary"),
    path("change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("team/", TeamView.as_view(), name="auth-team"),
    path("demo-login/", DemoLoginView.as_view(), name="auth-demo-login"),
    path("", include(router.urls)),
]
