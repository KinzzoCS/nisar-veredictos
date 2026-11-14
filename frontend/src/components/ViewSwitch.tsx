import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TEMAS, aplicarTema, temaGuardado, type Tema } from '../tema/tema'
import { VISTAS, useVista } from '../vista/vista'

/**
 * Selector de vista (RF-INT-02): botones con aria-pressed, como el de idioma, así que se usa
 * con Tab y Enter o Espacio. La vista se recuerda en el navegador.
 */
export function ViewSwitch() {
  const { t } = useTranslation()
  const { vista, cambiarVista } = useVista()
  return (
    <div role="group" aria-label={t('view.label')} className="segmented">
      {VISTAS.map((v) => (
        <button key={v} type="button" aria-pressed={vista === v} onClick={() => cambiarVista(v)}>
          {t(`view.${v}`)}
        </button>
      ))}
    </div>
  )
}

/** Tema: el del sistema, claro u oscuro (decisiones de T-FAR-12 y T-FAR-13). */
export function ThemeSwitch() {
  const { t } = useTranslation()
  const [tema, setTema] = useState<Tema>(temaGuardado)
  return (
    <div role="group" aria-label={t('theme.label')} className="segmented">
      {TEMAS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={tema === v}
          onClick={() => {
            aplicarTema(v)
            setTema(v)
          }}
        >
          {t(`theme.${v}`)}
        </button>
      ))}
    </div>
  )
}
