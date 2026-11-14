import { describe, expect, it, vi } from "vitest";
import { capacidadGrafica, elegirProyeccion, type EntradaProyeccion } from "./globo";
import { estiloMapaBase } from "./mapaBase";

/** Lienzo falso: `acelerado` responde a failIfMajorPerformanceCaveat, `alguno` a cualquier otro. */
function lienzos(acelerado: boolean, alguno: boolean) {
  const perder = vi.fn();
  const gl = { getExtension: () => ({ loseContext: perder }) };
  const crear = () => ({
    getContext: (_tipo: string, atributos?: WebGLContextAttributes) =>
      (atributos?.failIfMajorPerformanceCaveat ? acelerado : alguno) ? gl : null,
  });
  return { crear: crear as unknown as () => HTMLCanvasElement, perder };
}

describe("capacidad gráfica", () => {
  it("con WebGL 2 acelerado, completa, y libera el contexto de prueba", () => {
    const { crear, perder } = lienzos(true, true);
    expect(capacidadGrafica(crear)).toBe("completa");
    expect(perder).toHaveBeenCalledTimes(1);
  });

  it("con WebGL 2 por software, sin aceleración", () => {
    expect(capacidadGrafica(lienzos(false, true).crear)).toBe("sin_aceleracion");
  });

  it("sin WebGL 2, no hay mapa", () => {
    expect(capacidadGrafica(lienzos(false, false).crear)).toBe("sin_webgl2");
  });

  it("si getContext lanza, cuenta como sin WebGL 2", () => {
    const crear = () => ({
      getContext: () => {
        throw new Error("bloqueado");
      },
    });
    expect(capacidadGrafica(crear as unknown as () => HTMLCanvasElement)).toBe("sin_webgl2");
  });
});

describe("proyección", () => {
  const BASE: EntradaProyeccion = {
    modo3d: true,
    capacidad: "completa",
    falloGlobo: false,
    comparadorActivo: false,
  };

  it("sin modo3d, plano y sin aviso, aunque falte aceleración", () => {
    expect(elegirProyeccion({ ...BASE, modo3d: false, capacidad: "sin_aceleracion" })).toEqual({
      tipo: "mercator",
      motivo: null,
    });
  });

  it("con modo3d y todo bien, globo", () => {
    expect(elegirProyeccion(BASE)).toEqual({ tipo: "globe", motivo: null });
  });

  it("sin aceleración, 2D y lo dice (RF-INT-17)", () => {
    expect(elegirProyeccion({ ...BASE, capacidad: "sin_aceleracion" })).toEqual({
      tipo: "mercator",
      motivo: "sin_aceleracion",
    });
  });

  it("si el globo falló, 2D y lo dice", () => {
    expect(elegirProyeccion({ ...BASE, falloGlobo: true }).motivo).toBe("fallo_globo");
  });

  it("con el comparador, 2D para que radar y óptico casen (RF-INT-20)", () => {
    expect(elegirProyeccion({ ...BASE, comparadorActivo: true })).toEqual({
      tipo: "mercator",
      motivo: "comparador",
    });
  });
});

describe("estilo del mapa base", () => {
  it("lleva la proyección pedida; por defecto, plano", () => {
    expect(estiloMapaBase().projection).toEqual({ type: "mercator" });
    expect(estiloMapaBase("globe").projection).toEqual({ type: "globe" });
  });
});
