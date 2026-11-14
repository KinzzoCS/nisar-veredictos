// Tema elegido por la persona (T-FAR-13): el del sistema, claro u oscuro.
// tokens.css usa el del sistema y <html data-tema> lo fuerza (decisiones de T-FAR-12).

export const TEMAS = ['sistema', 'claro', 'oscuro'] as const
export type Tema = (typeof TEMAS)[number]

const CLAVE = 'tema'

export function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === 'claro' || t === 'oscuro' ? t : 'sistema'
  } catch {
    return 'sistema'
  }
}

/** Aplica el tema en <html> y lo recuerda si se puede. */
export function aplicarTema(tema: Tema) {
  const html = document.documentElement
  if (tema === 'sistema') delete html.dataset.tema
  else html.dataset.tema = tema
  try {
    if (tema === 'sistema') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento el tema se aplica igual; solo no se recuerda.
  }
}
