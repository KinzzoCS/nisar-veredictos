import createClient from 'openapi-fetch'
import type { components, paths } from './verdicts'

/** Origen del gateway: todo (API y teselas) se sirve desde aquí. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8080').replace(/\/$/, '')

/** Cliente tipado de la API de veredictos. Los tipos salen de `contracts/verdicts.openapi.json`. */
export const verdictsApi = createClient<paths>({
  baseUrl: `${API_BASE}/api/verdicts`,
  // Se resuelve en cada petición: así las pruebas pueden sustituir fetch.
  fetch: (request) => globalThis.fetch(request),
})

/** La API da plantillas de tesela relativas al gateway; el mapa las necesita absolutas. */
export function absoluteTileUrl(template: string): string {
  return `${API_BASE}${template}`
}

type Schemas = components['schemas']
export type Verdict = Schemas['Verdict']
export type EventVerdict = Schemas['EventVerdict']
export type SeriesInfo = Schemas['SeriesInfo']
export type PixelSeries = Schemas['PixelSeries']
export type Receipt = Schemas['Receipt']
export type DataKind = SeriesInfo['data_kind']
export type Lang = 'es' | 'en'
