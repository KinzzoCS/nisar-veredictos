import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Iconos de línea del sistema en blanco y negro (2026-11-14): trazo de 1,75 en una caja de 24, extremos
 * redondeados y color heredado. Son decorativos: el nombre del botón va en `aria-label`.
 */
const TRAZOS: Record<string, ReactNode> = {
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  ver: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  guardar: <path d="M6.5 3.5h11v17l-5.5-3.75-5.5 3.75z" />,
  mapa: (
    <>
      <path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  historia: (
    <>
      <path d="M12 6.5c-1.8-1.5-4.4-2-8-2v13c3.6 0 6.2.5 8 2 1.8-1.5 4.4-2 8-2v-13c-3.6 0-6.2.5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  evento: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v3l2 1" />
    </>
  ),
  interprete: (
    <>
      <path d="M4 20h4.5L19.5 9a2.1 2.1 0 0 0-3-3L5.5 17z" />
      <path d="M14.5 8l3 3M13 20h7" />
    </>
  ),
  comunidad: (
    <>
      <circle cx="9" cy="8.5" r="3.25" />
      <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.25M17.5 14.3c2 .7 3.5 2.6 3.5 5.2" />
    </>
  ),
  descargar: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  abrir: <path d="M13.5 4.5H19.5V10.5M19.5 4.5l-8.5 8.5M17.5 14v5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h5" />,
  borrar: <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7" />,
  cerrar: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  quitar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.25 9.25l5.5 5.5M14.75 9.25l-5.5 5.5" />
    </>
  ),
  entrar: <path d="M14.5 4h4.5v16h-4.5M9.5 8l4 4-4 4M13.5 12H4" />,
  salir: <path d="M9.5 4H5v16h4.5M15 8l4 4-4 4M19 12H9.5" />,
  anterior: <path d="M14.5 6l-6 6 6 6" />,
  siguiente: <path d="M9.5 6l6 6-6 6" />,
  volver: <path d="M9.5 7L5 11.5 9.5 16M5 11.5h9.5a4.5 4.5 0 0 1 0 9H12" />,
  comparar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M12 3v18" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  luna: <path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z" />,
  cuenta: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20.5c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5" />
    </>
  ),
}

export type NombreIcono = keyof typeof TRAZOS

export function Icono({ nombre, tamano = 20 }: { nombre: NombreIcono; tamano?: number }) {
  return (
    <svg
      className="icono"
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  )
}

/**
 * Botón solo con icono. El nombre accesible es `etiqueta` (aria-label) y la misma etiqueta sale como
 * descripción emergente (`title`), para quien usa ratón y no reconoce el icono.
 */
export function BotonIcono({
  icono,
  etiqueta,
  className,
  type = 'button',
  ...resto
}: { icono: NombreIcono; etiqueta: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...resto} type={type} className={`boton-icono${className ? ` ${className}` : ''}`} aria-label={etiqueta} title={etiqueta}>
      <Icono nombre={icono} />
    </button>
  )
}
