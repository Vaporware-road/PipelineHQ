from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .tracking_views import TrackClickView, TrackOpenView
from .views import (
    AccountViewSet,
    ActivityViewSet,
    AiSuggestionViewSet,
    AnalyticsView,
    AuditEventViewSet,
    AvailabilitySlotViewSet,
    ContactViewSet,
    CustomFieldDefinitionViewSet,
    DashboardView,
    DuplicateCheckView,
    DuplicateMergeView,
    EmailMessageViewSet,
    EmailTemplateViewSet,
    ForecastView,
    GlobalSearchView,
    JobRunViewSet,
    LeadRoutingRuleViewSet,
    LeadViewSet,
    MeetingViewSet,
    NotificationViewSet,
    OpportunityViewSet,
    OpsView,
    ProductViewSet,
    PublicBookingView,
    QuoteLineItemViewSet,
    QuoteViewSet,
    SequenceEnrollmentViewSet,
    SequenceViewSet,
    TaskViewSet,
    TerritoryViewSet,
    TimelineView,
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
router.register("emails", EmailMessageViewSet, basename="email-message")
router.register("sequences", SequenceViewSet, basename="sequence")
router.register("sequence-enrollments", SequenceEnrollmentViewSet, basename="sequence-enrollment")
router.register("availability", AvailabilitySlotViewSet, basename="availability")
router.register("meetings", MeetingViewSet, basename="meeting")
router.register("products", ProductViewSet, basename="product")
router.register("quotes", QuoteViewSet, basename="quote")
router.register("quote-line-items", QuoteLineItemViewSet, basename="quote-line-item")
router.register("territories", TerritoryViewSet, basename="territory")
router.register("custom-fields", CustomFieldDefinitionViewSet, basename="custom-field")
router.register("audit-events", AuditEventViewSet, basename="audit-event")
router.register("ai-suggestions", AiSuggestionViewSet, basename="ai-suggestion")
router.register("jobs", JobRunViewSet, basename="job")

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("timeline/", TimelineView.as_view(), name="timeline"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("duplicates/check/", DuplicateCheckView.as_view(), name="duplicates-check"),
    path("duplicates/merge/", DuplicateMergeView.as_view(), name="duplicates-merge"),
    path("analytics/<str:kind>/", AnalyticsView.as_view(), name="analytics"),
    path("forecast/", ForecastView.as_view(), name="forecast"),
    path("ops/<str:action_name>/", OpsView.as_view(), name="ops-action"),
    path("book/<slug:slug>/", PublicBookingView.as_view(), name="public-book"),
    path("", include(router.urls)),
]

tracking_urlpatterns = [
    path("t/o/<str:token>/", TrackOpenView.as_view(), name="track-open"),
    path("t/c/<str:token>/", TrackClickView.as_view(), name="track-click"),
]
