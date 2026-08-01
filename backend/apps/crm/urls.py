from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AccountViewSet,
    ActivityViewSet,
    AnalyticsView,
    ContactViewSet,
    DashboardView,
    EmailTemplateViewSet,
    ForecastView,
    GlobalSearchView,
    JobRunViewSet,
    LeadRoutingRuleViewSet,
    LeadViewSet,
    NotificationViewSet,
    OpportunityViewSet,
    OpsView,
    SequenceEnrollmentViewSet,
    SequenceViewSet,
    TaskViewSet,
)

router = DefaultRouter()
router.register("leads", LeadViewSet, basename="lead")
router.register("accounts", AccountViewSet, basename="account")
router.register("contacts", ContactViewSet, basename="contact")
router.register("opportunities", OpportunityViewSet, basename="opportunity")
router.register("activities", ActivityViewSet, basename="activity")
router.register("tasks", TaskViewSet, basename="task")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("routing-rules", LeadRoutingRuleViewSet, basename="routing-rule")
router.register("email-templates", EmailTemplateViewSet, basename="email-template")
router.register("sequences", SequenceViewSet, basename="sequence")
router.register("sequence-enrollments", SequenceEnrollmentViewSet, basename="sequence-enrollment")
router.register("jobs", JobRunViewSet, basename="job")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("analytics/<str:kind>/", AnalyticsView.as_view(), name="analytics"),
    path("forecast/", ForecastView.as_view(), name="forecast"),
    path("ops/<str:action_name>/", OpsView.as_view(), name="ops-action"),
    path("", include(router.urls)),
]
