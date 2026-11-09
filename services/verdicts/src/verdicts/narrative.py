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


def pair_summary(decision: rules.Decision, start: str, end: str, spans_gap: bool, lang: Lang, synthetic: bool) -> dict:
    observed = f"{decision.observed_fraction:.0%}"
    changed = f"{decision.changed_fraction:.1%}"
    if lang == "es":
        if decision.state == rules.CHANGE_PROBABLE:
            detected = f"Entre {start} y {end} cambió la señal de radar en el {changed} de la superficie observada."
            limits = "No identifica la causa ni mide daños; la explicación requiere otra fuente o verificación en campo."
        elif decision.state == rules.NO_DETECTABLE_CHANGE:
            detected = f"Entre {start} y {end} no detectamos cambios sobre el umbral en el {observed} observado de la zona."
            limits = "No demuestra que nada cambiara: lo pequeño, lo breve o lo ocurrido entre pasadas puede no aparecer."
        else:
            detected = f"No podemos afirmar nada entre {start} y {end}: solo se observó el {observed} de la zona ({CAUSES[lang][decision.cause]})."
            limits = "La ausencia de resultado no significa que no haya pasado nada."
        missing = (
            "Este par cruza el hueco de datos de julio-agosto de 2026, así que cubre un intervalo más largo."
            if spans_gap
            else "Falta contrastar con una fuente independiente."
        )
    else:
        if decision.state == rules.CHANGE_PROBABLE:
            detected = f"Between {start} and {end}, the radar signal changed over {changed} of the observed surface."
            limits = "It does not identify the cause or measure damage; explaining it needs another source or field checks."
        elif decision.state == rules.NO_DETECTABLE_CHANGE:
            detected = f"Between {start} and {end}, we detected no change above the threshold in the {observed} of the area observed."
            limits = "It does not prove nothing changed: small, brief or between-pass changes may not appear."
        else:
            detected = f"We cannot say anything between {start} and {end}: only {observed} of the area was observed ({CAUSES[lang][decision.cause]})."
            limits = "The lack of a result does not mean nothing happened."
        missing = (
            "This pair crosses the July-August 2026 data gap, so it covers a longer interval."
            if spans_gap
            else "It still needs checking against an independent source."
        )
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
