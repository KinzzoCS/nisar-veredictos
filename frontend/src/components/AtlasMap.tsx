import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { VerdictMapOptions } from '../api/mapOptions'
import { crearMapa } from '../mapa/mapa'
import type { CapaRadar, MapaAtlas } from '../mapa/tipos'

interface Props {
  options: VerdictMapOptions
  /** Comparador óptico activo. Solo cuenta si hay escena óptica (`canCompare`). */
  compare: boolean
  /** Hay escena óptica que comparar con el radar. */
  canCompare: boolean
  /** Llega un veredicto nuevo: se tapa el mapa para no leer las capas anteriores como actuales. */
  busy: boolean
  /** Globo 3D (true) o plano (false), desde la barra de herramientas (RF-INT-28). */
  modo3d: boolean
  /** Capa radar visible, elegida en la barra de herramientas. */
  layer: CapaRadar
  /** Opacidad de las capas radar, de 0,2 a 1. */
  opacity: number
  /** Cada vez que cambia, el mapa vuelve a encuadrar la zona. */
  reframe: number
}

/**
 * Monta el mapa de Atlas (T-FAR-05) a pantalla completa (T-FAR-21). `crearMapa` y `destruir` van en el mismo
 * efecto, así que StrictMode no deja dos mapas; los cambios posteriores pasan por `actualizar()`.
 * Las herramientas (3D, capas, opacidad, encuadre y comparador) viven en la barra inferior de la app, así que
 * el mapa se crea sin su botón 3D ni su selector de capas.
 */
export function AtlasMap({ options, compare, canCompare, busy, modo3d, layer, opacity, reframe }: Props) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapaAtlas | null>(null)
  const swipe = compare && canCompare

  // Las props con que se crea el mapa (solo se leen al montarlo) y lo último que recibió, para no
  // repetir actualizar(): con capas nuevas, actualizar() las vuelve a cargar.
  const latest = useRef({ options, swipe, modo3d, layer, opacity })
  const applied = useRef<typeof latest.current | null>(null)

  useEffect(() => {
    if (!container.current) return
    const { options: o, swipe: s, modo3d: m, layer: l, opacity: op } = latest.current
    const created = crearMapa(container.current, {
      ...o,
      compare: s ? 'swipe' : 'off',
      modo3d: m,
      activeLayer: l,
      control3d: false,
      controlCapas: false,
    })
    created.fijarOpacidad(op)
    map.current = created
    applied.current = latest.current
    return () => {
      created.destruir()
      map.current = null
      applied.current = null
    }
  }, [])

  useEffect(() => {
    const a = applied.current
    const m = map.current
    if (!m || !a) return
    const cambios: Parameters<MapaAtlas['actualizar']>[0] = {}
    // Solo lo que cambió: reenviar las capas las volvería a cargar.
    if (a.options !== options) Object.assign(cambios, options)
    if (a.swipe !== swipe || a.options !== options) cambios.compare = swipe ? 'swipe' : 'off'
    if (a.modo3d !== modo3d) cambios.modo3d = modo3d
    if (a.layer !== layer || a.options !== options) cambios.activeLayer = layer
    if (Object.keys(cambios).length) m.actualizar(cambios)
    if (a.opacity !== opacity) m.fijarOpacidad(opacity)
    applied.current = { options, swipe, modo3d, layer, opacity }
  }, [options, swipe, modo3d, layer, opacity])

  const primerEncuadre = useRef(reframe)
  useEffect(() => {
    if (reframe !== primerEncuadre.current) map.current?.encuadrar()
  }, [reframe])

  return (
    <section className="atlas-map" aria-label={t('map.label')}>
      <div className="atlas-map-frame" aria-busy={busy}>
        <div ref={container} className="atlas-map-canvas" />
        {busy && (
          <p className="atlas-map-busy" role="status">
            {t('picker.loading')}
          </p>
        )}
      </div>
    </section>
  )
}
