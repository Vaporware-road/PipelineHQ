"""Duplicate detection and manager merge for leads, contacts, and accounts."""

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import User

from .models import Account, Contact, Lead, Opportunity, SequenceEnrollment, Task, TimelineEvent
from .timeline import record_timeline_event


def _domain_from_email(email: str) -> str:
    if "@" in (email or ""):
        return email.split("@", 1)[1].lower().strip()
    return ""


def find_lead_duplicates(
    *,
    email: str = "",
    name: str = "",
    company: str = "",
    exclude_id: int | None = None,
    limit: int = 10,
) -> list[dict]:
    email = (email or "").strip().lower()
    name = (name or "").strip()
    company = (company or "").strip()
    domain = _domain_from_email(email)

    qs = Lead.objects.select_related("owner").exclude(status=Lead.Status.CONVERTED)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)

    scored: dict[int, dict] = {}

    def add(lead: Lead, reason: str, score: int):
        entry = scored.get(lead.id)
        if entry is None:
            scored[lead.id] = {
                "id": lead.id,
                "entity_type": "lead",
                "label": lead.name,
                "subtitle": f"{lead.company} · {lead.email}",
                "email": lead.email,
                "company": lead.company,
                "status": lead.status,
                "owner": lead.owner.username,
                "href": f"/leads/{lead.id}",
                "reasons": [reason],
                "score": score,
            }
        else:
            if reason not in entry["reasons"]:
                entry["reasons"].append(reason)
            entry["score"] = max(entry["score"], score)

    if email:
        for lead in qs.filter(email__iexact=email)[:limit]:
            add(lead, "exact_email", 100)

    if domain and company:
        for lead in qs.filter(company__iexact=company, email__iendswith=f"@{domain}")[:limit]:
            add(lead, "company_and_domain", 80)

    if name and company:
        for lead in qs.filter(name__iexact=name, company__iexact=company)[:limit]:
            add(lead, "name_and_company", 70)

    if domain and not email:
        for lead in qs.filter(email__iendswith=f"@{domain}")[:limit]:
            add(lead, "email_domain", 40)

    return sorted(scored.values(), key=lambda x: (-x["score"], x["label"]))[:limit]


def find_contact_duplicates(
    *,
    email: str = "",
    name: str = "",
    account_id: int | None = None,
    exclude_id: int | None = None,
    limit: int = 10,
) -> list[dict]:
    email = (email or "").strip().lower()
    name = (name or "").strip()

    qs = Contact.objects.select_related("account", "account__owner")
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)

    scored: dict[int, dict] = {}

    def add(contact: Contact, reason: str, score: int):
        entry = scored.get(contact.id)
        if entry is None:
            scored[contact.id] = {
                "id": contact.id,
                "entity_type": "contact",
                "label": contact.name,
                "subtitle": f"{contact.account.name} · {contact.email}",
                "email": contact.email,
                "account_id": contact.account_id,
                "account_name": contact.account.name,
                "href": f"/contacts/{contact.id}",
                "reasons": [reason],
                "score": score,
            }
        else:
            if reason not in entry["reasons"]:
                entry["reasons"].append(reason)
            entry["score"] = max(entry["score"], score)

    if email:
        for contact in qs.filter(email__iexact=email)[:limit]:
            add(contact, "exact_email", 100)

    if name and account_id:
        for contact in qs.filter(name__iexact=name, account_id=account_id)[:limit]:
            add(contact, "name_on_account", 75)

    return sorted(scored.values(), key=lambda x: (-x["score"], x["label"]))[:limit]


def find_account_duplicates(
    *,
    name: str = "",
    domain: str = "",
    exclude_id: int | None = None,
    limit: int = 10,
) -> list[dict]:
    name = (name or "").strip()
    domain = (domain or "").strip().lower()

    qs = Account.objects.select_related("owner")
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)

    scored: dict[int, dict] = {}

    def add(account: Account, reason: str, score: int):
        entry = scored.get(account.id)
        if entry is None:
            scored[account.id] = {
                "id": account.id,
                "entity_type": "account",
                "label": account.name,
                "subtitle": account.domain or account.industry or "Account",
                "domain": account.domain,
                "industry": account.industry,
                "owner": account.owner.username,
                "href": f"/accounts/{account.id}",
                "reasons": [reason],
                "score": score,
            }
        else:
            if reason not in entry["reasons"]:
                entry["reasons"].append(reason)
            entry["score"] = max(entry["score"], score)

    if domain:
        for account in qs.filter(domain__iexact=domain)[:limit]:
            add(account, "exact_domain", 100)

    if name:
        for account in qs.filter(name__iexact=name)[:limit]:
            add(account, "exact_name", 80)

    return sorted(scored.values(), key=lambda x: (-x["score"], x["label"]))[:limit]


def check_duplicates(
    *,
    entity_type: str,
    email: str = "",
    name: str = "",
    company: str = "",
    domain: str = "",
    account_id: int | None = None,
    exclude_id: int | None = None,
) -> list[dict]:
    entity_type = (entity_type or "").lower()
    if entity_type == "lead":
        return find_lead_duplicates(
            email=email, name=name, company=company, exclude_id=exclude_id
        )
    if entity_type == "contact":
        return find_contact_duplicates(
            email=email, name=name, account_id=account_id, exclude_id=exclude_id
        )
    if entity_type == "account":
        return find_account_duplicates(name=name, domain=domain or _domain_from_email(email), exclude_id=exclude_id)
    raise ValidationError({"entity_type": "Must be lead, contact, or account."})


@transaction.atomic
def merge_records(
    *,
    entity_type: str,
    winner_id: int,
    loser_id: int,
    actor: User,
) -> dict:
    if actor.role != User.Role.MANAGER:
        raise PermissionDenied("Only Sales Managers can merge duplicates.")
    if winner_id == loser_id:
        raise ValidationError("winner_id and loser_id must differ.")

    entity_type = (entity_type or "").lower()
    if entity_type == "lead":
        return _merge_leads(winner_id, loser_id, actor)
    if entity_type == "contact":
        return _merge_contacts(winner_id, loser_id, actor)
    if entity_type == "account":
        return _merge_accounts(winner_id, loser_id, actor)
    raise ValidationError({"entity_type": "Must be lead, contact, or account."})


def _merge_leads(winner_id: int, loser_id: int, actor: User) -> dict:
    winner = Lead.objects.select_for_update().get(pk=winner_id)
    loser = Lead.objects.select_for_update().get(pk=loser_id)

    Task.objects.filter(lead=loser).update(lead=winner)
    # SequenceEnrollment has unique (sequence, lead) — drop loser enrollments that collide.
    winner_seq_ids = set(
        SequenceEnrollment.objects.filter(lead=winner).values_list("sequence_id", flat=True)
    )
    SequenceEnrollment.objects.filter(lead=loser, sequence_id__in=winner_seq_ids).delete()
    SequenceEnrollment.objects.filter(lead=loser).update(lead=winner)

    # Prefer non-empty fields from loser when winner is blank.
    updated = False
    for field in ("title", "notes", "company", "email", "name"):
        if not getattr(winner, field) and getattr(loser, field):
            setattr(winner, field, getattr(loser, field))
            updated = True
    if updated:
        winner.save()

    record_timeline_event(
        entity_type=TimelineEvent.EntityType.LEAD,
        entity_id=winner.id,
        event_type=TimelineEvent.EventType.MERGED,
        title=f"Merged duplicate lead #{loser.id}",
        body=f"Absorbed {loser.name} ({loser.email})",
        actor=actor,
        lead=winner,
        meta={"loser_id": loser.id, "loser_label": loser.name},
    )
    loser_id_saved = loser.id
    loser.delete()
    return {"entity_type": "lead", "winner_id": winner.id, "loser_id": loser_id_saved}


def _merge_contacts(winner_id: int, loser_id: int, actor: User) -> dict:
    winner = Contact.objects.select_for_update().select_related("account").get(pk=winner_id)
    loser = Contact.objects.select_for_update().get(pk=loser_id)

    Opportunity.objects.filter(primary_contact=loser).update(primary_contact=winner)
    Lead.objects.filter(converted_contact=loser).update(converted_contact=winner)

    for field in ("title", "phone", "email", "name"):
        if not getattr(winner, field) and getattr(loser, field):
            setattr(winner, field, getattr(loser, field))
    winner.save()

    record_timeline_event(
        entity_type=TimelineEvent.EntityType.CONTACT,
        entity_id=winner.id,
        event_type=TimelineEvent.EventType.MERGED,
        title=f"Merged duplicate contact #{loser.id}",
        body=f"Absorbed {loser.name} ({loser.email})",
        actor=actor,
        contact=winner,
        account=winner.account,
        meta={"loser_id": loser.id, "loser_label": loser.name},
    )
    loser_id_saved = loser.id
    loser.delete()
    return {"entity_type": "contact", "winner_id": winner.id, "loser_id": loser_id_saved}


def _merge_accounts(winner_id: int, loser_id: int, actor: User) -> dict:
    winner = Account.objects.select_for_update().get(pk=winner_id)
    loser = Account.objects.select_for_update().get(pk=loser_id)

    Contact.objects.filter(account=loser).update(account=winner)
    Opportunity.objects.filter(account=loser).update(account=winner)
    Lead.objects.filter(converted_account=loser).update(converted_account=winner)
    TimelineEvent.objects.filter(account=loser).update(account=winner)

    for field in ("domain", "industry"):
        if not getattr(winner, field) and getattr(loser, field):
            setattr(winner, field, getattr(loser, field))
    if not winner.name and loser.name:
        winner.name = loser.name
    winner.save()

    record_timeline_event(
        entity_type=TimelineEvent.EntityType.ACCOUNT,
        entity_id=winner.id,
        event_type=TimelineEvent.EventType.MERGED,
        title=f"Merged duplicate account #{loser.id}",
        body=f"Absorbed {loser.name}",
        actor=actor,
        account=winner,
        meta={"loser_id": loser.id, "loser_label": loser.name},
    )
    loser_id_saved = loser.id
    loser.delete()
    return {"entity_type": "account", "winner_id": winner.id, "loser_id": loser_id_saved}
