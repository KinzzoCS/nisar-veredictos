"""Reglas de decisión. Los umbrales son iniciales y deben calibrarse con datos reales."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import ceil

CHANGE_PROBABLE = "change_probable"
NO_DETECTABLE_CHANGE = "no_detectable_change"
NOT_OBSERVABLE = "not_observable"
OBSERVABLE = "observable"

MIN_OBSERVED_FRACTION = 0.5
MIN_CHANGED_FRACTION = 0.01
MIN_SIGNATURE_SHARE = 0.2

SIGNATURE_HYPOTHESIS = {
    "hh_up_hv_stable": "surface_moisture_or_flooded_vegetation",
    "hh_up_hv_up": "more_vegetation_wetting_or_water_retreat",
    "hh_down_hv_down": "vegetation_loss_smoother_surface_or_new_water",
    "hh_down_hv_stable": "drying_or_open_water",
    "other": "mixed_signature",
}

UNOBSERVABLE_CAUSES = ("outside_scene", "invalid_or_partial", "input_exception", "low_looks", "no_data", "terrain")


@dataclass(frozen=True)
class Decision:
    state: str
    cause: str | None
    observed_fraction: float
    changed_fraction: float


@dataclass(frozen=True)
class EventStatus:
    state: str
    cause: str | None
    previous_pass: date | None
    next_pass: date | None


def decide(counts: dict[str, int]) -> Decision:
    observed = counts.get("no_change", 0) + counts.get("change_probable", 0)
    total = sum(counts.values())
    observed_fraction = observed / total if total else 0.0
    changed_fraction = counts.get("change_probable", 0) / observed if observed else 0.0

    if observed_fraction < MIN_OBSERVED_FRACTION:
        cause = max(UNOBSERVABLE_CAUSES, key=lambda name: counts.get(name, 0))
        return Decision(NOT_OBSERVABLE, cause, observed_fraction, changed_fraction)
    state = CHANGE_PROBABLE if changed_fraction >= MIN_CHANGED_FRACTION else NO_DETECTABLE_CHANGE
    return Decision(state, None, observed_fraction, changed_fraction)


def hypotheses(signature_counts: dict[str, int]) -> list[str]:
    """Firmas relevantes por área, de mayor a menor. Orientan, no identifican la causa."""
    total = sum(signature_counts.values())
    if not total:
        return []
    relevant = [
        (count, name)
        for name, count in signature_counts.items()
        if name in SIGNATURE_HYPOTHESIS and count / total >= MIN_SIGNATURE_SHARE
    ]
    return [SIGNATURE_HYPOTHESIS[name] for _, name in sorted(relevant, reverse=True)]


def event_status(dates: list[date], event: date, persistence_hours: int) -> EventStatus:
    """Decide si alguna pasada pudo ver un evento mientras duraba."""
    ordered = sorted(set(dates))
    previous_pass = max((day for day in ordered if day < event), default=None)
    next_pass = min((day for day in ordered if day >= event), default=None)
    deadline = event + timedelta(days=ceil(persistence_hours / 24))
    if next_pass is None or previous_pass is None:
        return EventStatus(NOT_OBSERVABLE, "outside_series_window", previous_pass, next_pass)
    if next_pass <= deadline:
        return EventStatus(OBSERVABLE, None, previous_pass, next_pass)
    return EventStatus(NOT_OBSERVABLE, "no_acquisition_during_event", previous_pass, next_pass)
