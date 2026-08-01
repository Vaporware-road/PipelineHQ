from rest_framework.permissions import BasePermission, SAFE_METHODS

from apps.accounts.models import User


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.MANAGER)


class IsSDRorManager(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in {User.Role.SDR, User.Role.MANAGER}
        )


class RoleScopedAccess(BasePermission):
    """
    Object-level rules:
    - Manager: full read; write mostly allowed for forecast/ops
    - Others: must own the object (owner / created_by / lead owner)
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user.is_authenticated:
            return False
        if user.role == User.Role.MANAGER:
            return True

        owner = getattr(obj, "owner", None) or getattr(obj, "created_by", None)
        if owner is not None:
            return owner_id_equals(owner, user)

        # Contact: scoped via account owner
        account = getattr(obj, "account", None)
        if account is not None and getattr(account, "owner_id", None):
            return account.owner_id == user.id

        return False


def owner_id_equals(owner, user) -> bool:
    owner_id = owner.id if hasattr(owner, "id") else owner
    return owner_id == user.id


class ReadOnlyOrOwnerWrite(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            user = request.user
            if user.role == User.Role.MANAGER:
                return True
            owner = getattr(obj, "owner", None) or getattr(obj, "created_by", None)
            if owner is not None:
                return owner_id_equals(owner, user)
            account = getattr(obj, "account", None)
            if account is not None:
                return account.owner_id == user.id
            return False
        return RoleScopedAccess().has_object_permission(request, view, obj)
