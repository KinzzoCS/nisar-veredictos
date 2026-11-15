// Tema de color (specs/08-interfaz): por omisión el del sistema; el botón del sol y la luna lo alterna entre
// claro y oscuro y lo recuerda. tokens.css usa el del sistema y <html data-tema> lo fuerza.

export type Tema = 'claro' | 'oscuro'

const CLAVE = 'tema'

/** Tema guardado por la persona, o null si sigue al del sistema. Sin almacenamiento, null. */
export function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === 'claro' || t === 'oscuro' ? t : null
  } catch {
    return null
  }
}

function sistemaOscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function movimientoReducido(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** El tema que se ve ahora: el forzado en <html> o, si no hay, el del sistema. */
export function temaActual(): Tema {
  const forzado = document.documentElement.dataset.tema
  if (forzado === 'claro' || forzado === 'oscuro') return forzado
  return sistemaOscuro() ? 'oscuro' : 'claro'
}

/** Fija el tema en <html> sin animar (al arrancar). null: el del sistema. */
export function aplicarTema(tema: Tema | null) {
  const html = document.documentElement
  if (tema) html.dataset.tema = tema
  else delete html.dataset.tema
}

/**
 * Cambia al tema indicado con una transición y lo guarda. Con View Transitions, el tema nuevo se abre en
 * círculo desde el botón; sin ellas, los colores se funden. Con movimiento reducido, cambia sin animar.
 */
export function cambiarTema(tema: Tema, origen?: { x: number; y: number }) {
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento el tema se aplica igual; solo no se recuerda.
  }
  const html = document.documentElement
  if (movimientoReducido()) return aplicarTema(tema)

  const doc = document as Document & { startViewTransition?: (cambio: () => void) => unknown }
  if (typeof doc.startViewTransition === 'function') {
    const x = origen?.x ?? window.innerWidth
    const y = origen?.y ?? 0
    html.style.setProperty('--tema-x', `${x}px`)
    html.style.setProperty('--tema-y', `${y}px`)
    html.style.setProperty('--tema-r', `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`)
    doc.startViewTransition(() => aplicarTema(tema))
    return
  }
  html.classList.add('tema-transicion')
  aplicarTema(tema)
  window.setTimeout(() => html.classList.remove('tema-transicion'), 450)
}
