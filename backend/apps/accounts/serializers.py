from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role")
        read_only_fields = fields


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
