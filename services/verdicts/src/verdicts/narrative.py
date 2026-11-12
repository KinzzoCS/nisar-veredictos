"""Plantillas deterministas: mismo dato, mismo texto, sin generar afirmaciones nuevas."""
from __future__ import annotations

from typing import Literal

from . import rules

Lang = Literal["es", "en"]

CAUSES = {
    "es": {
        "outside_scene": "la zona queda fuera de la pasada",
        "invalid_or_partial": "datos inválidos o parcialmente enfocados",
        "input_exception": "anomalía en los datos de entrada",
        "low_looks": "muy pocas muestras de radar por píxel",
        "no_data": "píxeles sin dato utilizable",
        "terrain": "relieve que oculta o distorsiona la señal",
        "no_acquisition_during_event": "no hubo ninguna pasada mientras duraba el evento",
        "outside_series_window": "el evento queda fuera del periodo con datos",
    },
    "en": {
        "outside_scene": "the area falls outside the pass",
        "invalid_or_partial": "invalid or partially focused data",
        "input_exception": "input data anomaly",
        "low_looks": "too few radar samples per pixel",
        "no_data": "pixels without usable data",
        "terrain": "terrain hides or distorts the signal",
        "no_acquisition_during_event": "no pass occurred while the event lasted",
        "outside_series_window": "the event falls outside the period with data",
    },
}

HYPOTHESES = {
    "es": {
        "surface_moisture_or_flooded_vegetation": "Hipótesis: más humedad en superficie o agua bajo vegetación (sube HH, HV estable).",
        "more_vegetation_wetting_or_water_retreat": "Hipótesis: más vegetación, humedecimiento general o retirada de agua (suben HH y HV).",
        "vegetation_loss_smoother_surface_or_new_water": "Hipótesis: pérdida de vegetación, superficie más lisa o agua nueva (bajan HH y HV).",
        "drying_or_open_water": "Hipótesis: secado del suelo o agua abierta (baja HH).",
        "mixed_signature": "La firma por polarización es mixta y no sugiere una causa clara.",
    },
    "en": {
        "surface_moisture_or_flooded_vegetation": "Hypothesis: wetter surface or water under vegetation (HH up, HV stable).",
        "more_vegetation_wetting_or_water_retreat": "Hypothesis: more vegetation, general wetting or water retreat (HH and HV up).",
        "vegetation_loss_smoother_surface_or_new_water": "Hypothesis: vegetation loss, smoother surface or new water (HH and HV down).",
        "drying_or_open_water": "Hypothesis: soil drying or open water (HH down).",
        "mixed_signature": "The polarization signature is mixed and suggests no clear cause.",
    },
}

SYNTHETIC_PREFIX = {"es": "[DATOS SINTÉTICOS] ", "en": "[SYNTHETIC DATA] "}


LATENCY_UNKNOWN = {
    "es": {
        "synthetic": "La latencia de publicación no aplica a datos sintéticos.",
        "catalog_unavailable": "No se conoce la latencia de publicación: el catálogo no respondió.",
        "granule_not_in_catalog": "No se conoce la latencia de publicación: el gránulo no aparece en el catálogo.",
        "not_published": "No se conoce la latencia de publicación: el catálogo no da fecha de publicación.",
    },
    "en": {
        "synthetic": "Publication latency does not apply to synthetic data.",
        "catalog_unavailable": "Publication latency is unknown: the catalog did not respond.",
        "granule_not_in_catalog": "Publication latency is unknown: the granule is not in the catalog.",
        "not_published": "Publication latency is unknown: the catalog gives no publication date.",
    },
}


def _days(count: int, lang: Lang) -> str:
    if lang == "es":
        return f"{count} día" if count == 1 else f"{count} días"
    return f"{count} day" if count == 1 else f"{count} days"


def _hours(value: float, lang: Lang) -> str:
    # Se muestra el valor de catalog tal cual (un decimal), sin redondear más.
    text = f"{value:.1f}"
    return text.replace(".", ",") if lang == "es" else text


def freshness_text(age_days: int, latency_hours: float | None, latency_status: str, lang: Lang) -> str:
    """Edad de la imagen más reciente y latencia de publicación, o por qué no se conoce."""
    if lang == "es":
        age = f"La imagen más reciente tiene {_days(age_days, lang)}."
        if latency_status == "available" and latency_hours is not None:
            latency = (
                f"Se publicó {_hours(latency_hours, lang)} horas después de adquirirse "
                "(aproximación con la fecha de actualización de CMR)."
            )
        else:
            latency = LATENCY_UNKNOWN[lang][latency_status]
    else:
        age = f"The most recent image is {_days(age_days, lang)} old."
        if latency_status == "available" and latency_hours is not None:
            latency = (
                f"It was published {_hours(latency_hours, lang)} hours after acquisition "
                "(approximated with the CMR update date)."
            )
        else:
            latency = LATENCY_UNKNOWN[lang][latency_status]
    return f"{age} {latency}"


def pair_summary(
    decision: rules.Decision,
    start: str,
    end: str,
    spans_gap: bool,
    lang: Lang,
    synthetic: bool,
    *,
    interval_days: int,
    age_days: int,
    latency_hours: float | None,
    latency_status: str,
    kind: str = "consecutive",
) -> dict:
    observed = f"{decision.observed_fraction:.0%}"
    changed = f"{decision.changed_fraction:.1%}"
    span = _days(interval_days, lang)
    if lang == "es":
        if decision.state == rules.CHANGE_PROBABLE:
            detected = f"Entre {start} y {end} ({span}) cambió la señal de radar en el {changed} de la superficie observada."
            limits = "No identifica la causa ni mide sus consecuencias; explicarlo requiere otra fuente o verificación en campo."
        elif decision.state == rules.NO_DETECTABLE_CHANGE:
            detected = f"Entre {start} y {end} ({span}) no detectamos cambios sobre el umbral en el {observed} observado de la zona."
            limits = "No demuestra que nada cambiara: lo pequeño, lo breve o lo ocurrido entre pasadas puede no aparecer."
        else:
            detected = f"No podemos afirmar nada entre {start} y {end} ({span}): solo se observó el {observed} de la zona ({CAUSES[lang][decision.cause]})."
            limits = "La ausencia de resultado no significa que no haya pasado nada."
        if kind == "full_window":
            context = f"Este par compara la primera y la última fecha de la serie, separadas {span}; resume todo el periodo, no un cambio puntual."
            if spans_gap:
                context += " El periodo incluye el hueco sin adquisiciones del 27 de julio al 10 de agosto de 2026."
        elif spans_gap:
            context = (
                f"Las imágenes están separadas {span} porque el par cruza el hueco sin adquisiciones del "
                "27 de julio al 10 de agosto de 2026; lo ocurrido en ese tiempo puede no verse."
            )
        else:
            context = "Falta contrastar con una fuente independiente."
    else:
        if decision.state == rules.CHANGE_PROBABLE:
            detected = f"Between {start} and {end} ({span}), the radar signal changed over {changed} of the observed surface."
            limits = "It does not identify the cause or measure its consequences; explaining it needs another source or field checks."
        elif decision.state == rules.NO_DETECTABLE_CHANGE:
            detected = f"Between {start} and {end} ({span}), we detected no change above the threshold in the {observed} of the area observed."
            limits = "It does not prove nothing changed: small, brief or between-pass changes may not appear."
        else:
            detected = f"We cannot say anything between {start} and {end} ({span}): only {observed} of the area was observed ({CAUSES[lang][decision.cause]})."
            limits = "The lack of a result does not mean nothing happened."
        if kind == "full_window":
            context = f"This pair compares the first and last dates of the series, {span} apart; it sums up the whole period, not a single change."
            if spans_gap:
                context += " The period includes the acquisition gap from 27 July to 10 August 2026."
        elif spans_gap:
            context = (
                f"The images are {span} apart because the pair crosses the acquisition gap from "
                "27 July to 10 August 2026; what happened in that time may not show."
            )
        else:
            context = "It still needs checking against an independent source."
    missing = f"{context} {freshness_text(age_days, latency_hours, latency_status, lang)}"
    prefix = SYNTHETIC_PREFIX[lang] if synthetic else ""
    return {"detected": prefix + detected, "does_not_prove": limits, "missing": missing}


def event_summary(status: rules.EventStatus, event: str, lang: Lang, synthetic: bool) -> dict:
    previous = status.previous_pass.isoformat() if status.previous_pass else "-"
    following = status.next_pass.isoformat() if status.next_pass else "-"
    if lang == "es":
        if status.state == rules.OBSERVABLE:
            detected = f"Hubo una pasada el {following}, dentro de la duración indicada del evento del {event}."
            limits = "Que haya pasada no garantiza que el evento se vea; hay que consultar el veredicto de ese par."
            missing = "Revisar el par que incluye esa fecha."
        else:
            detected = f"El evento del {event} no es observable: {CAUSES[lang][status.cause]}. Pasada anterior: {previous}; siguiente: {following}."
            limits = "Esto no indica que el evento no ocurriera; indica que el radar no pudo registrarlo."
            missing = "Haría falta una fuente con mayor frecuencia o reportes locales."
    else:
        if status.state == rules.OBSERVABLE:
            detected = f"A pass occurred on {following}, within the stated duration of the {event} event."
            limits = "A pass does not guarantee the event is visible; check that pair's verdict."
            missing = "Review the pair that includes that date."
        else:
            detected = f"The {event} event is not observable: {CAUSES[lang][status.cause]}. Previous pass: {previous}; next: {following}."
            limits = "This does not mean the event did not happen; the radar could not record it."
            missing = "It would need a more frequent source or local reports."
    prefix = SYNTHETIC_PREFIX[lang] if synthetic else ""
    return {"detected": prefix + detected, "does_not_prove": limits, "missing": missing}


# --- T-BAL-04: contraste óptico Sentinel-2 ------------------------------------------------

OPTICAL_ROLE = {
    "es": {"before": ("de antes", "la primera fecha de radar"), "after": ("de después", "la segunda fecha de radar")},
    "en": {"before": ("before", "the first radar date"), "after": ("after", "the second radar date")},
}


def _percent(value: float, lang: Lang) -> str:
    text = f"{value:.1f}".removesuffix(".0")
    return (text.replace(".", ",") if lang == "es" else text) + " %"


def _optical_side(
    side: str,
    status: str,
    acquired: str | None,
    days: int | None,
    cloud: float | None,
    lang: Lang,
    max_cloud: float,
    search_days: int,
) -> str:
    role, radar = OPTICAL_ROLE[lang][side]
    window = _days(search_days, lang)
    limit = _percent(max_cloud, lang)
    if lang == "es":
        if status == "catalog_unavailable":
            return f"No se sabe si hay imagen óptica Sentinel-2 {role}: el catálogo no respondió."
        if status == "none_in_window":
            return f"No hay imagen óptica Sentinel-2 {role} a {window} o menos de {radar}."
        offset = f"el mismo día que {radar}" if days == 0 else f"{_days(abs(days), lang)} {'antes' if side == 'before' else 'después'} de {radar}"
        text = f"Imagen óptica Sentinel-2 {role}: {acquired}, {offset}, con hasta {_percent(cloud, lang)} de nubes por tesela."
        if status == "cloudy":
            text += f" Es la menos nublada: ninguna a {window} o menos cubre la zona con {limit} de nubes o menos."
        elif status == "partial_coverage":
            text += f" Solo cubre parte de la zona: ninguna a {window} o menos la cubre entera."
        return text
    if status == "catalog_unavailable":
        return f"It is unknown whether there is a Sentinel-2 optical image {role} {radar}: the catalog did not respond."
    if status == "none_in_window":
        return f"There is no Sentinel-2 optical image within {window} {role} {radar}."
    offset = f"the same day as {radar}" if days == 0 else f"{_days(abs(days), lang)} {'before' if side == 'before' else 'after'} {radar}"
    text = f"Optical image {role} (Sentinel-2): {acquired}, {offset}, with up to {_percent(cloud, lang)} cloud per tile."
    if status == "cloudy":
        text += f" It is the least cloudy: none within {window} covers the area with {limit} cloud or less."
    elif status == "partial_coverage":
        text += f" It covers only part of the area: none within {window} covers all of it."
    return text


def optical_text(
    before: tuple[str, str | None, int | None, float | None],
    after: tuple[str, str | None, int | None, float | None],
    lang: Lang,
    *,
    max_cloud: float,
    search_days: int,
) -> str:
    """Cada lado es (estado, fecha, días respecto a la fecha de radar, nubosidad máxima por tesela)."""
    if before[0] == after[0] == "catalog_unavailable":
        if lang == "es":
            return "No se sabe si hay imágenes ópticas Sentinel-2: el catálogo no respondió."
        return "It is unknown whether there are Sentinel-2 optical images: the catalog did not respond."
    parts = [
        _optical_side(side, *values, lang, max_cloud, search_days)
        for side, values in (("before", before), ("after", after))
    ]
    if any(values[1] is not None for values in (before, after)):
        if lang == "es":
            parts.append(
                "La nubosidad es la de cada tesela completa, no la de la zona. "
                "La imagen óptica sirve de contexto y no explica por sí sola la señal de radar."
            )
        else:
            parts.append(
                "Cloud cover is for each whole tile, not for the area. "
                "The optical image gives context and does not explain the radar signal on its own."
            )
    return " ".join(parts)
