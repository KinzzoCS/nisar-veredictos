import type { DataKind } from '../api/client'

/**
 * Interfaz del mapa que publica Atlas (specs/04-atlas/plan.md).
 * Faro solo la consume; el componente real vive en `src/mapa/`, que es de Atlas.
 */
export type MapLayerName = 'state' | 'change_hh' | 'change_hv'

export interface MapProps {
  /** [oeste, sur, este, norte] en WGS84. */
  aoi: [number, number, number, number]
  /** Plantillas de tesela absolutas (con el origen del gateway delante). */
  layers: Record<MapLayerName, string>
  activeLayer: MapLayerName
  optical?: { before?: string; after?: string }
  compare: 'off' | 'swipe'
  dataKind: DataKind
  /** Clic o Enter sobre el mapa; coordenadas con 5 decimales. */
  onPointSelected?: (point: { lon: number; lat: number }) => void
  onViewChanged?: (view: { bbox: [number, number, number, number]; zoom: number }) => void
}
