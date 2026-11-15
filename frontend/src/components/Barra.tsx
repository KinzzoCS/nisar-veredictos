import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icono, type NombreIcono } from './Iconos'

export type Lado = 'arriba' | 'abajo' | 'izq' | 'der'

/** Icono de la pestaña: apunta hacia donde se mueve la barra al pulsarla. */
const FLECHA: Record<Lado, { abrir: NombreIcono; recoger: NombreIcono }> = {
  arriba: { abrir: 'abajo', recoger: 'arriba' },
  abajo: { abrir: 'arriba', recoger: 'abajo' },
  izq: { abrir: 'siguiente', recoger: 'anterior' },
  der: { abrir: 'anterior', recoger: 'siguiente' },
}

/** Botón que abre o recoge una barra (RF-INT-25). Nombre accesible y `title` dicen qué hará. */
export function BotonRecoger({
  lado,
  abierta,
  nombre,
  controla,
  onCambiar,
  className,
}: {
  lado: Lado
  abierta: boolean
  nombre: string
  controla: string
  onCambiar: (abierta: boolean) => void
  className?: string
}) {
  const { t } = useTranslation()
  const etiqueta = t(abierta ? 'layout.collapse' : 'layout.expand', { name: nombre })
  return (
    <button
      type="button"
      className={`boton-icono ${className ?? ''}`}
      aria-expanded={abierta}
      aria-controls={controla}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={() => onCambiar(!abierta)}
    >
      <Icono nombre={FLECHA[lado][abierta ? 'recoger' : 'abrir']} />
    </button>
  )
}

/**
 * Barra de vidrio recogible en un borde de la pantalla (T-FAR-21, RF-INT-25). Recogida, solo queda su
 * pestaña en el borde; el contenido lleva `hidden`, así que sale del orden de tabulación y del árbol de
 * accesibilidad, aunque el CSS lo deja deslizarse fuera de la pantalla en lugar de desaparecer de golpe.
 */
export function BarraRecogible({
  lado,
  id,
  nombre,
  abierta,
  onCambiar,
  children,
  className,
}: {
  lado: Lado
  id: string
  nombre: string
  abierta: boolean
  onCambiar: (abierta: boolean) => void
  children: ReactNode
  className?: string
}) {
  // El foco no se pierde al abrir o recoger: si estaba en la barra, pasa a su contenido o a su pestaña.
  const caja = useRef<HTMLDivElement>(null)
  const antes = useRef(abierta)
  useEffect(() => {
    if (antes.current === abierta) return
    antes.current = abierta
    const raiz = caja.current
    if (!raiz) return
    const activo = document.activeElement
    const fuera = activo && activo !== document.body && !raiz.contains(activo)
    if (fuera) return
    if (abierta) raiz.querySelector<HTMLElement>('.barra-contenido')?.focus()
    else raiz.querySelector<HTMLElement>('.barra-pestana')?.focus()
  }, [abierta])

  // Abierta, la pestaña del borde se oculta: el panel lleva su propio botón para recogerse
  // (`BotonRecoger` dentro de `children`), en su cabecera o al final de la barra.
  return (
    <div ref={caja} className={`barra barra-${lado} ${className ?? ''}`} data-abierta={abierta}>
      {!abierta && (
        <BotonRecoger
          lado={lado}
          abierta={false}
          nombre={nombre}
          controla={id}
          onCambiar={onCambiar}
          className="barra-pestana vidrio"
        />
      )}
      <div id={id} className="barra-contenido vidrio" hidden={!abierta} tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}

/** Cabecera de un panel: icono, título y botón para recogerlo, como en el diseño de referencia. */
export function CabeceraPanel({
  icono,
  titulo,
  idTitulo,
  children,
}: {
  icono: NombreIcono
  titulo: string
  idTitulo?: string
  children?: ReactNode
}) {
  return (
    <div className="panel-cabecera">
      <Icono nombre={icono} tamano={22} />
      <h2 id={idTitulo}>{titulo}</h2>
      {children}
    </div>
  )
}
