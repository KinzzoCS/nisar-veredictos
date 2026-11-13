import { describe, expect, it } from "vitest";
import {
  ATRIBUCION_OSM,
  contornoZona,
  estiloMapaBase,
  formatoCoordenada,
  textoExtension,
  validarBbox,
} from "./mapaBase";
import type { Bbox } from "./tipos";

const PARRAL: Bbox = [-105.95, 26.7, -105.4, 27.15];

describe("mapa base", () => {
  it("declara la atribución de OpenStreetMap con enlace", () => {
    const fuente = estiloMapaBase().sources.osm as { attribution?: string };
    expect(fuente.attribution).toBe(ATRIBUCION_OSM);
    expect(ATRIBUCION_OSM).toContain("https://www.openstreetmap.org/copyright");
  });

  it("cierra el contorno de la zona", () => {
    const anillo = contornoZona(PARRAL).geometry.coordinates[0];
    expect(anillo).toHaveLength(5);
    expect(anillo[0]).toEqual(anillo[4]);
    expect(anillo[0]).toEqual([-105.95, 26.7]);
    expect(anillo[2]).toEqual([-105.4, 27.15]);
  });

  it.each<[string, Bbox]>([
    ["oeste mayor que este", [-105.4, 26.7, -105.95, 27.15]],
    ["sur mayor que norte", [-105.95, 27.15, -105.4, 26.7]],
    ["fuera de rango", [-200, 26.7, -105.4, 27.15]],
    ["no finito", [Number.NaN, 26.7, -105.4, 27.15]],
  ])("rechaza una extensión con %s", (_, bbox) => {
    expect(() => validarBbox(bbox)).toThrow();
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
