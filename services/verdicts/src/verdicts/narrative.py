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
        "timing_uncertain": "sin la hora UTC del evento o de la pasada no se sabe si la pasada cayó mientras duraba",
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
        "timing_uncertain": "without the UTC time of the event or the pass, it is unknown whether the pass fell while it lasted",
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


EVENT_TYPES = {
    "es": {"urban_storm": "una tormenta urbana", "river_flood": "una crecida de río", "wildfire": "un incendio"},
    "en": {"urban_storm": "an urban storm", "river_flood": "a river flood", "wildfire": "a wildfire"},
}


def persistence_text(persistence: rules.Persistence, lang: Lang) -> str:
    """Declara de dónde sale la duración usada: siempre es un supuesto, nunca una medición."""
    hours = persistence.hours
    if lang == "es":
        if persistence.source == "event_type":
            return (f"Supuesto: el evento dura {hours} h, valor inicial sin calibrar para "
                    f"{EVENT_TYPES[lang][persistence.event_type]}; no se midió.")
        if persistence.source == "user":
            return f"Supuesto: el evento dura {hours} h, según la consulta; no se midió."
        return (f"Supuesto: el evento dura {hours} h, valor por omisión sin calibrar; no se midió. "
                "Los parámetros event_type o persistence_hours lo cambian.")
    if persistence.source == "event_type":
        return (f"Assumption: the event lasts {hours} h, an initial uncalibrated value for "
                f"{EVENT_TYPES[lang][persistence.event_type]}; it was not measured.")
    if persistence.source == "user":
        return f"Assumption: the event lasts {hours} h, as given in the query; it was not measured."
    return (f"Assumption: the event lasts {hours} h, an uncalibrated default; it was not measured. "
            "The event_type or persistence_hours parameters change it.")


def event_summary(
    status: rules.EventStatus,
    event: str,
    lang: Lang,
    synthetic: bool,
    persistence: rules.Persistence | None = None,
) -> dict:
    previous = status.previous_pass.isoformat() if status.previous_pass else "-"
    following = status.next_pass.isoformat() if status.next_pass else "-"
    seen = status.seen_by.isoformat() if status.seen_by else following
    uncertain = status.cause == "timing_uncertain"
    if lang == "es":
        if status.state == rules.OBSERVABLE:
            detected = f"Hubo una pasada el {seen}, dentro de la duración indicada del evento del {event}."
            limits = "Que haya pasada no garantiza que el evento se vea; hay que consultar el veredicto de ese par."
            missing = "Revisar el par que incluye esa fecha."
        else:
            detected = f"El evento del {event} no es observable: {CAUSES[lang][status.cause]}. Pasada anterior: {previous}; siguiente: {following}."
            if uncertain:
                limits = "La pasada pudo caer dentro del evento o fuera; con estos datos no se puede afirmar ninguna de las dos."
                missing = "Indicar la hora UTC de inicio del evento (parámetro time) permite decidirlo."
            else:
                limits = "Esto no indica que el evento no ocurriera; indica que el radar no pudo registrarlo."
                missing = "Haría falta una fuente con mayor frecuencia o reportes locales."
    else:
        if status.state == rules.OBSERVABLE:
            detected = f"A pass occurred on {seen}, within the stated duration of the {event} event."
            limits = "A pass does not guarantee the event is visible; check that pair's verdict."
            missing = "Review the pair that includes that date."
        else:
            detected = f"The {event} event is not observable: {CAUSES[lang][status.cause]}. Previous pass: {previous}; next: {following}."
            if uncertain:
                limits = "The pass may have fallen inside or outside the event; these data cannot tell which."
                missing = "Giving the event's UTC start time (time parameter) makes it decidable."
            else:
                limits = "This does not mean the event did not happen; the radar could not record it."
                missing = "It would need a more frequent source or local reports."
    if persistence is not None:
        limits = f"{limits} {persistence_text(persistence, lang)}"
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


# --- T-BAL-08: contraste con OPERA DSWx-S1 ------------------------------------------------

WATER_ROLE = {
    "es": {"before": "la primera fecha de radar", "after": "la segunda fecha de radar"},
    "en": {"before": "the first radar date", "after": "the second radar date"},
}

WATER_NOT_COMPARED = {
    "es": {
        "synthetic": "no se compara con datos de radar sintéticos",
        "no_credentials": "no se comparó porque el servicio no tiene acceso a sus archivos (requieren cuenta de Earthdata)",
        "read_failed": "no se pudo leer su capa de agua, así que no se compara",
        "no_overlap": "no tiene píxeles válidos en común con el radar dentro de la zona",
    },
    "en": {
        "synthetic": "it is not compared with synthetic radar data",
        "no_credentials": "it was not compared because the service has no access to its files (they need an Earthdata account)",
        "read_failed": "its water layer could not be read, so it is not compared",
        "no_overlap": "it shares no valid pixels with the radar inside the area",
    },
}


def _share(fraction: float, lang: Lang) -> str:
    if 0 < fraction < 0.001:
        return "< 0,1 %" if lang == "es" else "< 0.1 %"
    return _percent(fraction * 100, lang)


def _water_side(side: str, values: dict, lang: Lang, search_days: int) -> str:
    """values: status, product_date, days, assessment, basis, iou, radar, reference (fracciones)."""
    radar = WATER_ROLE[lang][side]
    status, days = values["status"], values.get("days")
    window = _days(search_days, lang)
    if lang == "es":
        if status == "catalog_unavailable":
            return f"No se sabe si hay producto de agua OPERA DSWx-S1 cerca de {radar}: el catálogo no respondió."
        if status == "none_in_window":
            return f"No hay producto de agua OPERA DSWx-S1 a {window} o menos de {radar}; no hay contraste."
        offset = f"el mismo día que {radar}" if days == 0 else (
            f"{_days(abs(days), lang)} {'antes' if days < 0 else 'después'} de {radar}")
        product = f"OPERA DSWx-S1 del {values['product_date']} ({offset})"
        if status != "compared":
            return f"Hay un producto {product}, pero {WATER_NOT_COMPARED[lang][status]}."
        shares = f"radar {_share(values['radar'], lang)} y DSWx-S1 {_share(values['reference'], lang)} de los píxeles comparables"
        if values["basis"] == "little_water":
            return f"{product} y el radar coinciden: ninguno de los dos ve agua apreciable en la zona ({shares})."
        iou = _share(values["iou"] or 0.0, lang)
        if values["assessment"] == "agree":
            return (f"{product} y el radar coinciden en dónde hay agua: comparten el {iou} de los píxeles "
                    f"que alguno de los dos marca como agua ({shares}).")
        return (f"{product} y el radar no coinciden en dónde hay agua: solo comparten el {iou} de los píxeles "
                f"que alguno de los dos marca como agua ({shares}). Es un desacuerdo entre dos métodos "
                "y no indica cuál de los dos acierta.")
    if status == "catalog_unavailable":
        return f"It is unknown whether there is an OPERA DSWx-S1 water product near {radar}: the catalog did not respond."
    if status == "none_in_window":
        return f"There is no OPERA DSWx-S1 water product within {window} of {radar}; there is no cross-check."
    offset = f"the same day as {radar}" if days == 0 else (
        f"{_days(abs(days), lang)} {'before' if days < 0 else 'after'} {radar}")
    product = f"OPERA DSWx-S1 from {values['product_date']} ({offset})"
    if status != "compared":
        return f"There is a product, {product}, but {WATER_NOT_COMPARED[lang][status]}."
    shares = f"radar {_share(values['radar'], lang)} and DSWx-S1 {_share(values['reference'], lang)} of comparable pixels"
    if values["basis"] == "little_water":
        return f"{product} and the radar agree: neither sees noticeable water in the area ({shares})."
    iou = _share(values["iou"] or 0.0, lang)
    if values["assessment"] == "agree":
        return (f"{product} and the radar agree on where there is water: they share {iou} of the pixels "
                f"either one marks as water ({shares}).")
    return (f"{product} and the radar disagree on where there is water: they share only {iou} of the pixels "
            f"either one marks as water ({shares}). This is a disagreement between two methods "
            "and does not tell which one is right.")


def water_text(
    before: dict,
    after: dict,
    lang: Lang,
    *,
    search_days: int,
    min_water_body_ha: float | None,
    min_water_body_width_m: float | None,
    hh_db: float,
    hv_db: float,
) -> str:
    """Resumen del contraste de agua: un texto por lado y, si hay producto, sus límites."""
    if before["status"] == after["status"] == "catalog_unavailable":
        if lang == "es":
            return "No se sabe si hay productos de agua OPERA DSWx-S1: el catálogo no respondió."
        return "It is unknown whether there are OPERA DSWx-S1 water products: the catalog did not respond."
    parts = [_water_side(side, values, lang, search_days) for side, values in (("before", before), ("after", after))]
    found = [values for values in (before, after) if values["status"] not in ("catalog_unavailable", "none_in_window")]
    if found and min_water_body_ha is not None and min_water_body_width_m is not None:
        ha = _hours(min_water_body_ha, lang).removesuffix(",0").removesuffix(".0")
        width = _hours(min_water_body_width_m, lang).removesuffix(",0").removesuffix(".0")
        if lang == "es":
            parts.append(f"DSWx-S1 solo detecta masas de agua abiertas de más de {ha} ha y {width} m de ancho: "
                         "no ver agua en él no descarta agua en calles o charcos.")
        else:
            parts.append(f"DSWx-S1 only detects open water bodies larger than {ha} ha and {width} m wide: "
                         "seeing no water in it does not rule out water in streets or puddles.")
    if any(values["status"] == "compared" for values in found):
        hh, hv = _hours(hh_db, lang), _hours(hv_db, lang)
        if lang == "es":
            parts.append(f"El agua del radar es la de los píxeles con HH < {hh} dB y HV < {hv} dB, "
                         "umbrales sin calibrar.")
        else:
            parts.append(f"Radar water means pixels with HH < {hh} dB and HV < {hv} dB, uncalibrated thresholds.")
    return " ".join(parts)
