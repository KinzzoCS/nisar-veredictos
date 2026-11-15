import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cambiarTema, temaActual, type Tema } from '../tema/tema'
import { BotonIcono } from './Iconos'

/** Alterna claro y oscuro con transición. El icono es el del tema al que se pasa: la luna lleva al oscuro. */
export function BotonTema() {
  const { t } = useTranslation()
  const [tema, setTema] = useState<Tema>(temaActual)
  const siguiente: Tema = tema === 'oscuro' ? 'claro' : 'oscuro'
  return (
    <BotonIcono
      icono={siguiente === 'oscuro' ? 'luna' : 'sol'}
      etiqueta={t(`theme.to.${siguiente}`)}
      className="boton-tema"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        cambiarTema(siguiente, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
        setTema(siguiente)
      }}
    />
  )
}
