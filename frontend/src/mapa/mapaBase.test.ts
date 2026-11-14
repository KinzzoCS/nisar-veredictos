import { describe, expect, it } from "vitest";
import {
  ATRIBUCION_NISAR,
  atribuciones,
  atribucionOsm,
  bboxContinuo,
  contornoZona,
  cruzaAntimeridiano,
  estiloMapaBase,
  formatoCoordenada,
  textoExtension,
  validarBbox,
} from "./mapaBase";
import type { Bbox } from "./tipos";

const PARRAL: Bbox = [-105.95, 26.7, -105.4, 27.15];

describe("mapa base", () => {
  it("atribuye OpenStreetMap con enlace y en el idioma del mapa", () => {
    expect(atribucionOsm("es")).toContain("colaboradores de OpenStreetMap");
    expect(atribucionOsm("en")).toContain("OpenStreetMap contributors");
    expect(atribucionOsm("en")).not.toContain("colaboradores");
    for (const idioma of ["es", "en"] as const) {
      expect(atribucionOsm(idioma)).toContain("https://www.openstreetmap.org/copyright");
    }
  });

  it("la fuente no fija la atribución: la pone el control, en el idioma del mapa", () => {
    const fuente = estiloMapaBase().sources.osm as { attribution?: string };
    expect(fuente.attribution).toBeUndefined();
  });

  it("NISAR solo se atribuye con capas de datos reales", () => {
    expect(atribuciones("en", false)).toEqual([atribucionOsm("en")]);
    expect(atribuciones("es", true)).toEqual([atribucionOsm("es"), ATRIBUCION_NISAR]);
  });

  it("cierra el contorno de la zona", () => {
    const anillo = contornoZona(PARRAL).geometry.coordinates[0];
    expect(anillo).toHaveLength(5);
    expect(anillo[0]).toEqual(anillo[4]);
    expect(anillo[0]).toEqual([-105.95, 26.7]);
    expect(anillo[2]).toEqual([-105.4, 27.15]);
  });

  it.each<[string, Bbox]>([
    ["ancho nulo", [-105.4, 26.7, -105.4, 27.15]],
    ["sur mayor que norte", [-105.95, 27.15, -105.4, 26.7]],
    ["fuera de rango", [-200, 26.7, -105.4, 27.15]],
    ["no finito", [Number.NaN, 26.7, -105.4, 27.15]],
  ])("rechaza una extensión con %s", (_, bbox) => {
    expect(() => validarBbox(bbox)).toThrow();
  });
});

describe("zonas que cruzan el antimeridiano", () => {
  // Por ejemplo, Fiyi: de 177° E a 178° O.
  const FIYI: Bbox = [177, -19, -178, -16];

  it("son válidas aunque el oeste sea mayor que el este", () => {
    expect(validarBbox(FIYI)).toEqual(FIYI);
    expect(cruzaAntimeridiano(FIYI)).toBe(true);
    expect(cruzaAntimeridiano(PARRAL)).toBe(false);
  });

  it("se encuadran con el este pasado de 180°, sin saltos", () => {
    expect(bboxContinuo(FIYI)).toEqual([177, -19, 182, -16]);
    expect(bboxContinuo(PARRAL)).toEqual(PARRAL);
  });

  it("el contorno no da la vuelta al mundo", () => {
    const anillo = contornoZona(FIYI).geometry.coordinates[0];
    const lons = anillo.map(([lon]) => lon);
    expect(Math.max(...lons) - Math.min(...lons)).toBe(5);
  });

  it("la extensión se describe con los valores originales", () => {
    expect(textoExtension(FIYI)).toBe("O 177° · S −19° · E −178° · N −16°");
  });
});

describe("formato de coordenadas", () => {
  it("no muestra más de 5 decimales", () => {
    expect(formatoCoordenada(-105.123456789)).toBe("−105.12346");
  });

  it("no rellena con ceros", () => {
    expect(formatoCoordenada(26.7)).toBe("26.7");
  });

  it("describe la extensión de Parral", () => {
    expect(textoExtension(PARRAL)).toBe("O −105.95° · S 26.7° · E −105.4° · N 27.15°");
  });
});
