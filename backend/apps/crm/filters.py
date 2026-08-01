import django_filters

from .models import Lead, Opportunity


class CharInFilter(django_filters.BaseInFilter, django_filters.CharFilter):
    pass


class LeadFilter(django_filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")
    source = CharInFilter(field_name="source", lookup_expr="in")
    owner = django_filters.NumberFilter(field_name="owner_id")
    created_after = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_before = django_filters.IsoDateTimeFilter(field_name="created_at", lookup_expr="lte")
    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Lead
        fields = ["status", "source", "owner"]


class OpportunityFilter(django_filters.FilterSet):
    stage = CharInFilter(field_name="stage", lookup_expr="in")
    forecast_category = CharInFilter(field_name="forecast_category", lookup_expr="in")
    owner = django_filters.NumberFilter(field_name="owner_id")
    is_stale = django_filters.BooleanFilter()
    account = django_filters.NumberFilter(field_name="account_id")
    amount_min = django_filters.NumberFilter(field_name="amount", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="amount", lookup_expr="lte")
    close_from = django_filters.DateFilter(field_name="close_date", lookup_expr="gte")
    close_to = django_filters.DateFilter(field_name="close_date", lookup_expr="lte")
    updated_after = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="gte")
    updated_before = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="lte")

    class Meta:
        model = Opportunity
        fields = ["stage", "forecast_category", "owner", "is_stale", "account"]
