"""EAV helpers for custom field definitions and values."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError

from .models import CustomFieldDefinition, CustomFieldValue

ENTITY_MODELS = {
    CustomFieldDefinition.Entity.LEAD: "Lead",
    CustomFieldDefinition.Entity.ACCOUNT: "Account",
    CustomFieldDefinition.Entity.CONTACT: "Contact",
    CustomFieldDefinition.Entity.OPPORTUNITY: "Opportunity",
}


def get_custom_field_map(entity_type: str, entity_id: int) -> dict:
    """Return {key: python_value} for an entity."""
    if not entity_id:
        return {}
    values = CustomFieldValue.objects.filter(
        entity_type=entity_type,
        entity_id=entity_id,
    ).select_related("definition")
    result = {}
    for row in values:
        result[row.definition.key] = _read_value(row)
    return result


def set_custom_fields(entity_type: str, entity_id: int, payload: dict | None) -> dict:
    """Upsert custom field values from a {key: value} dict. Returns the new map."""
    if payload is None:
        return get_custom_field_map(entity_type, entity_id)
    if not isinstance(payload, dict):
        raise ValidationError({"custom_fields": "Must be an object of key → value."})

    definitions = {
        d.key: d
        for d in CustomFieldDefinition.objects.filter(entity=entity_type, is_active=True)
    }
    for key, raw in payload.items():
        definition = definitions.get(key)
        if definition is None:
            raise ValidationError({"custom_fields": f"Unknown or inactive field '{key}'."})
        _upsert_value(definition, entity_type, entity_id, raw)
    return get_custom_field_map(entity_type, entity_id)


def _read_value(row: CustomFieldValue):
    ft = row.definition.field_type
    if ft == CustomFieldDefinition.FieldType.NUMBER:
        return float(row.value_number) if row.value_number is not None else None
    if ft == CustomFieldDefinition.FieldType.BOOL:
        return row.value_bool
    if ft == CustomFieldDefinition.FieldType.DATE:
        return row.value_date.isoformat() if row.value_date else None
    return row.value_text or ""


def _upsert_value(definition: CustomFieldDefinition, entity_type: str, entity_id: int, raw):
    row, _ = CustomFieldValue.objects.get_or_create(
        definition=definition,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    row.value_text = ""
    row.value_number = None
    row.value_bool = None
    row.value_date = None

    ft = definition.field_type
    if raw is None or raw == "":
        if definition.required:
            raise ValidationError({"custom_fields": f"'{definition.key}' is required."})
        row.save()
        return

    if ft == CustomFieldDefinition.FieldType.NUMBER:
        try:
            row.value_number = Decimal(str(raw))
        except (InvalidOperation, TypeError) as exc:
            raise ValidationError({"custom_fields": f"'{definition.key}' must be a number."}) from exc
    elif ft == CustomFieldDefinition.FieldType.BOOL:
        if isinstance(raw, bool):
            row.value_bool = raw
        elif str(raw).lower() in {"1", "true", "yes", "on"}:
            row.value_bool = True
        elif str(raw).lower() in {"0", "false", "no", "off"}:
            row.value_bool = False
        else:
            raise ValidationError({"custom_fields": f"'{definition.key}' must be true/false."})
    elif ft == CustomFieldDefinition.FieldType.DATE:
        if isinstance(raw, date) and not isinstance(raw, datetime):
            row.value_date = raw
        else:
            try:
                row.value_date = date.fromisoformat(str(raw)[:10])
            except ValueError as exc:
                raise ValidationError({"custom_fields": f"'{definition.key}' must be YYYY-MM-DD."}) from exc
    elif ft == CustomFieldDefinition.FieldType.SELECT:
        options = definition.options or []
        text = str(raw)
        if options and text not in options:
            raise ValidationError(
                {"custom_fields": f"'{definition.key}' must be one of: {', '.join(map(str, options))}"}
            )
        row.value_text = text
    else:
        row.value_text = str(raw)

    row.save()


def entity_ids_matching_custom_field(entity_type: str, key: str, value: str) -> list[int]:
    """IDs whose text/select custom field contains value (case-insensitive)."""
    qs = CustomFieldValue.objects.filter(
        entity_type=entity_type,
        definition__key=key,
        definition__entity=entity_type,
        definition__field_type__in=[
            CustomFieldDefinition.FieldType.TEXT,
            CustomFieldDefinition.FieldType.SELECT,
        ],
        value_text__icontains=value,
    )
    return list(qs.values_list("entity_id", flat=True))
