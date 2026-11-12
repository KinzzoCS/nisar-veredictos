import { useTranslation } from 'react-i18next'
import type { MapProps } from '../types/map'

/**
 * Hueco reservado para el mapa de Atlas. Recibe ya las mismas props que el mapa real,
 * así que integrarlo (T-FAR-05) es sustituir este componente por el de `src/mapa/`.
 */
export function MapSlot(props: MapProps) {
  const { t } = useTranslation()
  return (
    <section className="map-slot" aria-label={t('map.label')}>
      <p>{t('map.pending')}</p>
      <p className="muted">
        {t('map.bbox')}: {props.aoi.map((n) => n.toFixed(5)).join(', ')}
      </p>
    </section>
  )
}
