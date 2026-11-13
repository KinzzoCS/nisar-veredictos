import { useTranslation } from 'react-i18next'

/**
 * Distintivo permanente de datos sintéticos (RF-FAR-03). No se puede cerrar
 * y queda fijo en la cabecera mientras la serie elegida sea sintética.
 */
export function SyntheticBanner() {
  const { t } = useTranslation()
  return (
    <p className="synthetic-banner" role="note">
      <span aria-hidden="true">⚑ </span>
      {t('synthetic.banner')}
    </p>
  )
}

/** Versión corta dentro de la tarjeta: el aviso viaja con el veredicto. */
export function SyntheticNotice() {
  const { t } = useTranslation()
  return (
    <p className="synthetic-notice">
      <span aria-hidden="true">⚑ </span>
      {t('synthetic.card')}
    </p>
  )
}
