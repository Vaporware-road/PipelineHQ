from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "title",
            "phone",
            "is_active",
            "booking_slug",
        )
        read_only_fields = fields


class MeUpdateSerializer(serializers.ModelSerializer):
    """Self-service profile fields — role and is_active are not writable here."""

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "title", "phone", "booking_slug")

    def validate_booking_slug(self, value):
        value = (value or "").strip().lower()
        if not value:
            return None
        qs = User.objects.filter(booking_slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This booking slug is already taken.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class AdminUserSerializer(serializers.ModelSerializer):
    """Manager-facing team membership serializer (create / update / deactivate)."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "title",
            "phone",
            "is_active",
        )
        read_only_fields = ("id",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["username"].read_only = True

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value

    def validate(self, attrs):
        instance = self.instance
        if instance is None:
            password = attrs.get("password") or ""
            if not password:
                raise serializers.ValidationError({"password": "Password is required when creating a user."})
            return attrs

        request = self.context.get("request")
        actor = getattr(request, "user", None)
        new_role = attrs.get("role", instance.role)
        new_is_active = attrs.get("is_active", instance.is_active)

        if actor is not None and instance.pk == actor.pk:
            if new_is_active is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
            if instance.role == User.Role.MANAGER and new_role != User.Role.MANAGER:
                raise serializers.ValidationError({"role": "You cannot demote your own account."})

        losing_manager = (
            instance.role == User.Role.MANAGER
            and instance.is_active
            and (new_role != User.Role.MANAGER or new_is_active is False)
        )
        if losing_manager:
            other_active_managers = (
                User.objects.filter(role=User.Role.MANAGER, is_active=True).exclude(pk=instance.pk).exists()
            )
            if not other_active_managers:
                if new_is_active is False and instance.is_active:
                    raise serializers.ValidationError(
                        {"is_active": "Cannot deactivate the last active Sales Manager."}
                    )
                if new_role != User.Role.MANAGER:
                    raise serializers.ValidationError(
                        {"role": "Cannot demote the last active Sales Manager."}
                    )

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class DemoLoginSerializer(serializers.Serializer):
    """Maps a role button on the UI to a seeded demo username."""

    role = serializers.ChoiceField(choices=User.Role.choices)

    def validate_role(self, value):
        mapping = {
            User.Role.SDR: "sdr",
            User.Role.AE: "ae",
            User.Role.MANAGER: "manager",
        }
        username = mapping[value]
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("Demo user missing. Run: python manage.py seed_demo") from exc
        self.context["user"] = user
        return value
