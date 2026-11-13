import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VerdictMapOptions } from '../api/mapOptions'
import { crearMapa } from '../mapa/mapa'
import type { MapaAtlas } from '../mapa/tipos'

interface Props {
  options: VerdictMapOptions
  /** Hay escena óptica que comparar con el radar. */
  canCompare: boolean
  /** Llega un veredicto nuevo: se tapa el mapa para no leer las capas anteriores como actuales. */
  busy: boolean
}

/**
 * Monta el mapa de Atlas (T-FAR-05). `crearMapa` y `destruir` van en el mismo efecto, así
 * que StrictMode no deja dos mapas; los cambios posteriores pasan por `actualizar()`.
 */
export function AtlasMap({ options, canCompare, busy }: Props) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapaAtlas | null>(null)
  const [compare, setCompare] = useState(false)
  const swipe = compare && canCompare

  // Lo último que pidió React y lo último que recibió el mapa, para no repetir actualizar():
  // con capas nuevas, actualizar() las vuelve a cargar.
  const latest = useRef({ options, swipe })
  const applied = useRef<typeof latest.current | null>(null)

  useEffect(() => {
    if (!container.current) return
    const { options: o, swipe: s } = latest.current
    const created = crearMapa(container.current, { ...o, compare: s ? 'swipe' : 'off' })
    map.current = created
    applied.current = latest.current
    return () => {
      created.destruir()
      map.current = null
      applied.current = null
    }
  }, [])

  useEffect(() => {
    latest.current = { options, swipe }
    const a = applied.current
    if (!map.current || (a && a.options === options && a.swipe === swipe)) return
    const compare = swipe ? 'swipe' : 'off'
    // Solo cambia el comparador: no se reenvían las capas, que se volverían a cargar.
    map.current.actualizar(a?.options === options ? { compare } : { ...options, compare })
    applied.current = latest.current
  }, [options, swipe])

  return (
    <section className="atlas-map" aria-label={t('map.label')}>
      {canCompare && (
        <button type="button" aria-pressed={swipe} onClick={() => setCompare((c) => !c)}>
          {t('map.compare')}
        </button>
      )}
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
