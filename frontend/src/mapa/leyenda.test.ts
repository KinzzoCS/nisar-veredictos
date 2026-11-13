import { describe, expect, it } from "vitest";
import { crearLeyenda, type EstadoLeyenda } from "./leyenda";
import { TEXTOS } from "./textos";

const BASE: EstadoLeyenda = {
  idioma: "es",
  capa: "state",
  capasDisponibles: true,
  opacidad: 0.85,
  rango: null,
};

function dibujar(e: EstadoLeyenda): HTMLElement {
  const contenedor = document.createElement("div");
  crearLeyenda(contenedor, { alCambiarCapa: () => {}, alCambiarOpacidad: () => {} })(e);
  return contenedor;
}

describe("aviso de desplazamiento de toda la escena (scene_shift, PR 37)", () => {
  it("no aparece si el par no lo trae", () => {
    expect(dibujar(BASE).querySelector(".atlas-aviso-escena")).toBeNull();
  });

  it("va junto a «Cambio probable» en la capa de estado", () => {
    const c = dibujar({ ...BASE, avisoEscena: true });
    const aviso = c.querySelector(".atlas-aviso-escena");
    expect(aviso?.textContent).toBe(TEXTOS.es.avisoEscena);
    expect(aviso?.closest("li")?.textContent).toContain(TEXTOS.es.cambioProbable);
  });

  it("va junto a la escala en dB en las capas de cambio", () => {
    const c = dibujar({ ...BASE, capa: "change_hh", rango: [-10, 10], avisoEscena: true, idioma: "en" });
    const aviso = c.querySelector(".atlas-aviso-escena");
    expect(aviso?.textContent).toBe(TEXTOS.en.avisoEscena);
    expect(aviso?.closest("li")?.classList.contains("atlas-escala")).toBe(true);
  });
});
