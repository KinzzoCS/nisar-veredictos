import type { CapaRadar } from "./tipos";

export type Idioma = "es" | "en";

interface Textos {
  mapaDe: (zona: string) => string;
  extensionDe: (zona: string) => string;
  zonaPorDefecto: string;
  sintetico: string;
  capa: string;
  capas: Record<CapaRadar, string>;
  opacidad: string;
  leyenda: string;
  cambioProbable: string;
  sinCambio: string;
  sinCambioNota: string;
  noObservable: string;
  noObservableNota: string;
  causaPrincipal: string;
  bajo: string;
  subio: string;
  escalaDb: string;
}

export const TEXTOS: Record<Idioma, Textos> = {
  es: {
    mapaDe: (z) => `Mapa de ${z}`,
    extensionDe: (z) => `Extensión de ${z}`,
    zonaPorDefecto: "la zona de estudio",
    sintetico: "Datos sintéticos: no son una observación real",
    capa: "Capa",
    capas: {
      state: "Estado",
      change_hh: "Cambio HH",
      change_hv: "Cambio HV",
    },
    opacidad: "Opacidad",
    leyenda: "Leyenda",
    cambioProbable: "Cambio probable",
    sinCambio: "Sin cambio detectable",
    sinCambioNota: "sin color, se ve el mapa",
    noObservable: "No observable",
    noObservableNota: "el radar no pudo medir aquí; no es «sin cambio»",
    causaPrincipal: "Causa principal",
    bajo: "Bajó",
    subio: "Subió",
    escalaDb:
      "Cuánto cambió el brillo del radar, en decibelios (dB). Cerca de 0 dB, casi no cambió.",
  },
  en: {
    mapaDe: (z) => `Map of ${z}`,
    extensionDe: (z) => `Extent of ${z}`,
    zonaPorDefecto: "the study area",
    sintetico: "Synthetic data: not a real observation",
    capa: "Layer",
    capas: {
      state: "State",
      change_hh: "HH change",
      change_hv: "HV change",
    },
    opacidad: "Opacity",
    leyenda: "Legend",
    cambioProbable: "Probable change",
    sinCambio: "No detectable change",
    sinCambioNota: "no color, the map shows through",
    noObservable: "Not observable",
    noObservableNota: "the radar could not measure here; this is not “no change”",
    causaPrincipal: "Main cause",
    bajo: "Decreased",
    subio: "Increased",
    escalaDb: "How much the radar brightness changed, in decibels (dB). Near 0 dB, it barely changed.",
  },
};
