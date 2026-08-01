from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import DemoLoginSerializer, UserSerializer


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class TeamView(APIView):
    """Active teammates for filter dropdowns (demo CRM — all active users)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = User.objects.filter(is_active=True).order_by("role", "username")
        return Response(UserSerializer(qs, many=True).data)


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
