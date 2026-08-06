"""Serializers for Telegram Mini App auth / link."""

from django.contrib.auth import authenticate
from rest_framework import serializers


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()


class TelegramLinkSerializer(serializers.Serializer):
    init_data = serializers.CharField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            username=attrs["username"],
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid username or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is inactive.")
        attrs["user"] = user
        return attrs
