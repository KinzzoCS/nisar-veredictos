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
  // Selección de punto (T-ATL-04)
  puntoSeleccionado: string;
  lon: string;
  lat: string;
  serie: string;
  cargandoSerie: string;
  fueraDeSerie: string;
  errorSerie: string;
  sinDato: string;
  fecha: string;
  valoresPorFecha: string;
  estadoPorPar: string;
  verTabla: string;
  graficaAria: string;
  ayudaTeclado: string;
  cerrar: string;
  /** Igual que CAUSES de services/verdicts/src/verdicts/narrative.py. */
  causas: Record<string, string>;
}

const CAUSAS_ES: Record<string, string> = {
  outside_scene: "la zona queda fuera de la pasada",
  invalid_or_partial: "datos inválidos o parcialmente enfocados",
  input_exception: "anomalía en los datos de entrada",
  low_looks: "muy pocas muestras de radar por píxel",
  no_data: "píxeles sin dato utilizable",
  terrain: "relieve que oculta o distorsiona la señal",
};

const CAUSAS_EN: Record<string, string> = {
  outside_scene: "the area falls outside the pass",
  invalid_or_partial: "invalid or partially focused data",
  input_exception: "input data anomaly",
  low_looks: "too few radar samples per pixel",
  no_data: "pixels without usable data",
  terrain: "terrain hides or distorts the signal",
};

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
    puntoSeleccionado: "Punto seleccionado",
    lon: "Lon",
    lat: "Lat",
    serie: "Serie",
    cargandoSerie: "Cargando la historia del punto…",
    fueraDeSerie: "El punto queda fuera de la zona con datos.",
    errorSerie: "No se pudo cargar la historia del punto.",
    sinDato: "sin dato",
    fecha: "Fecha",
    valoresPorFecha: "Brillo del radar por fecha",
    estadoPorPar: "Resultado entre pasadas consecutivas",
    verTabla: "Ver los valores",
    graficaAria: "Brillo del radar HH y HV en este punto a lo largo del tiempo",
    ayudaTeclado: "Enter: ver la historia del punto central",
    cerrar: "Cerrar",
    causas: CAUSAS_ES,
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
    puntoSeleccionado: "Selected point",
    lon: "Lon",
    lat: "Lat",
    serie: "Series",
    cargandoSerie: "Loading the point's history…",
    fueraDeSerie: "The point falls outside the area with data.",
    errorSerie: "The point's history could not be loaded.",
    sinDato: "no data",
    fecha: "Date",
    valoresPorFecha: "Radar brightness by date",
    estadoPorPar: "Result between consecutive passes",
    verTabla: "Show the values",
    graficaAria: "HH and HV radar brightness at this point over time",
    ayudaTeclado: "Enter: show the history of the center point",
    cerrar: "Close",
    causas: CAUSAS_EN,
  },
};
