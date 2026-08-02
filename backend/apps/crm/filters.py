import django_filters

from .custom_fields import entity_ids_matching_custom_field
from .models import Account, Lead, Opportunity


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class LeadFilter(django_filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")
    source = CharInFilter(field_name="source", lookup_expr="in")
    priority = CharInFilter(field_name="priority", lookup_expr="in")
    owner = django_filters.NumberFilter(field_name="owner_id")
    created_after = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="lte")
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    custom_key = django_filters.CharFilter(method="filter_custom_field")
    custom_value = django_filters.CharFilter(method="filter_custom_field")

    class Meta:
        model = Lead
        fields = ["status", "source", "priority", "owner"]

    def filter_custom_field(self, qs, name, value):
        key = self.data.get("custom_key")
        val = self.data.get("custom_value")
        if not key or not val:
            return qs
        ids = entity_ids_matching_custom_field("lead", key, val)
        return qs.filter(id__in=ids)


class OpportunityFilter(django_filters.FilterSet):
    stage = CharInFilter(field_name="stage", lookup_expr="in")
    forecast_category = CharInFilter(field_name="forecast_category", lookup_expr="in")
    owner = django_filters.NumberFilter(field_name="owner_id")
    is_stale = django_filters.BooleanFilter()
    health = CharInFilter(field_name="health", lookup_expr="in")
    account = django_filters.NumberFilter(field_name="account_id")
    amount_min = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")
    close_from = django_filters.DateFilter(field_name="close_date", lookup_expr="gte")
    close_to = django_filters.DateFilter(field_name="close_date", lookup_expr="lte")
    updated_after = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="gte")
    updated_before = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="lte")
    territory = django_filters.NumberFilter(field_name="account__territory_id")
    custom_key = django_filters.CharFilter(method="filter_custom_field")
    custom_value = django_filters.CharFilter(method="filter_custom_field")

    class Meta:
        model = Opportunity
        fields = ["stage", "forecast_category", "owner", "is_stale", "health", "account"]

    def filter_custom_field(self, qs, name, value):
        key = self.data.get("custom_key")
        val = self.data.get("custom_value")
        if not key or not val:
            return qs
        ids = entity_ids_matching_custom_field("opportunity", key, val)
        return qs.filter(id__in=ids)


class AccountFilter(django_filters.FilterSet):
    industry = django_filters.CharFilter(field_name="industry", lookup_expr="iexact")
    owner = django_filters.NumberFilter(field_name="owner_id")
    territory = django_filters.NumberFilter(field_name="territory_id")
    my_territories = django_filters.BooleanFilter(method="filter_my_territories")
    custom_key = django_filters.CharFilter(method="filter_custom_field")
    custom_value = django_filters.CharFilter(method="filter_custom_field")

    class Meta:
        model = Account
        fields = ["industry", "owner", "territory"]

    def filter_my_territories(self, qs, name, value):
        if not value:
            return qs
        request = getattr(self, "request", None)
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return qs.none()
        return qs.filter(territory__members=user)

    def filter_custom_field(self, qs, name, value):
        key = self.data.get("custom_key")
        val = self.data.get("custom_value")
        if not key or not val:
            return qs
        ids = entity_ids_matching_custom_field("account", key, val)
        return qs.filter(id__in=ids)
