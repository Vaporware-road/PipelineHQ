"""Telegram Mini App auth, link, and unlink endpoints."""

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer

from .serializers import TelegramAuthSerializer, TelegramLinkSerializer
from .validation import InitDataError, InitDataExpiredError, InitDataInvalidError, validate_init_data


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request):
    return Response({"status": "ok", "app": "telegram"})


def _jwt_payload(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


def _telegram_user_public(tg_user: dict) -> dict:
    return {
        "id": tg_user.get("id"),
        "username": tg_user.get("username"),
        "first_name": tg_user.get("first_name"),
        "last_name": tg_user.get("last_name"),
        "language_code": tg_user.get("language_code"),
        "is_premium": tg_user.get("is_premium"),
        "photo_url": tg_user.get("photo_url"),
    }


def _parse_init_data(init_data: str) -> tuple[dict | None, Response | None]:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        return None, Response(
            {"detail": "Telegram bot is not configured."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        data = validate_init_data(init_data, token)
    except InitDataExpiredError as exc:
        return None, Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
    except InitDataInvalidError as exc:
        return None, Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
    except InitDataError as exc:
        return None, Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    tg_user = data.get("user")
    if not isinstance(tg_user, dict) or tg_user.get("id") is None:
        return None, Response(
            {"detail": "initData is missing user."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        tg_user["id"] = int(tg_user["id"])
    except (TypeError, ValueError):
        return None, Response(
            {"detail": "initData user.id is invalid."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return data, None


@api_view(["POST"])
@permission_classes([AllowAny])
def auth(request):
    serializer = TelegramAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data, error = _parse_init_data(serializer.validated_data["init_data"])
    if error is not None:
        return error

    assert data is not None
    tg_user = data["user"]
    telegram_id = tg_user["id"]
    try:
        user = User.objects.get(telegram_id=telegram_id)
    except User.DoesNotExist:
        return Response(
            {
                "needs_link": True,
                "telegram_user": _telegram_user_public(tg_user),
            }
        )

    payload = _jwt_payload(user)
    payload["needs_link"] = False
    return Response(payload)


@api_view(["POST"])
@permission_classes([AllowAny])
def link(request):
    serializer = TelegramLinkSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data, error = _parse_init_data(serializer.validated_data["init_data"])
    if error is not None:
        return error

    assert data is not None
    tg_user = data["user"]
    telegram_id = tg_user["id"]
    user: User = serializer.validated_data["user"]

    taken = User.objects.filter(telegram_id=telegram_id).exclude(pk=user.pk).exists()
    if taken:
        return Response(
            {"detail": "This Telegram account is already linked to another user."},
            status=status.HTTP_409_CONFLICT,
        )

    user.telegram_id = telegram_id
    user.save(update_fields=["telegram_id"])

    payload = _jwt_payload(user)
    payload["needs_link"] = False
    return Response(payload)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def unlink(request):
    user = request.user
    if user.telegram_id is None:
        return Response({"detail": "No Telegram account linked.", "telegram_id": None})
    user.telegram_id = None
    user.save(update_fields=["telegram_id"])
    return Response({"detail": "Telegram account unlinked.", "telegram_id": None})
