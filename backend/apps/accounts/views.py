from rest_framework import permissions, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.crm.models import Lead, Notification, Opportunity, Task
from apps.crm.permissions import IsManager
from apps.crm.services import OPEN_STAGES

from .models import User
from .serializers import (
    AdminUserSerializer,
    ChangePasswordSerializer,
    DemoLoginSerializer,
    MeUpdateSerializer,
    UserSerializer,
)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated."})


class MeSummaryView(APIView):
    """Personal workspace counts — always scoped to the authenticated user."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "open_leads": Lead.objects.filter(owner=user)
                .exclude(status=Lead.Status.CONVERTED)
                .count(),
                "open_opportunities": Opportunity.objects.filter(
                    owner=user, stage__in=OPEN_STAGES
                ).count(),
                "open_tasks": Task.objects.filter(owner=user, completed=False).count(),
                "unread_notifications": Notification.objects.filter(
                    user=user, is_read=False
                ).count(),
            }
        )


class TeamView(APIView):
    """Active teammates for filter dropdowns (demo CRM — all active users)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = User.objects.filter(is_active=True).order_by("role", "username")
        return Response(UserSerializer(qs, many=True).data)


class UserViewSet(viewsets.ModelViewSet):
    """Sales Manager team admin — list/create/update users and roles."""

    serializer_class = AdminUserSerializer
    permission_classes = [permissions.IsAuthenticated, IsManager]
    http_method_names = ["get", "post", "patch", "head", "options"]
    queryset = User.objects.all().order_by("role", "username")


class DemoLoginView(APIView):
    """One-click demo login for portfolio reviewers."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = DemoLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.context["user"]
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )
