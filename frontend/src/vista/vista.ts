// Vista elegida: Público, Estudiante o Investigador (T-FAR-13, RF-INT-02; plan en specs/08-interfaz/plan.md).
// La vista es solo presentación: no cambia qué datos se piden ni qué dice la API.
import { createContext, useContext } from 'react'

export const VISTAS = ['public', 'student', 'researcher'] as const
export type Vista = (typeof VISTAS)[number]

const CLAVE = 'vista'

function esVista(v: unknown): v is Vista {
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v)
}

/** Lee la vista guardada. Sin almacenamiento (modo privado, cuota), vuelve a Público. */
export function vistaGuardada(): Vista {
  try {
    const v = localStorage.getItem(CLAVE)
    return esVista(v) ? v : 'public'
  } catch {
    return 'public'
  }
}

export function guardarVista(vista: Vista) {
  try {
    localStorage.setItem(CLAVE, vista)
  } catch {
    // Sin almacenamiento la vista funciona igual; solo no se recuerda.
  }
}

export interface ValorVista {
  vista: Vista
  cambiarVista: (vista: Vista) => void
}

export const ContextoVista = createContext<ValorVista | null>(null)

export function useVista(): ValorVista {
  const valor = useContext(ContextoVista)
  if (!valor) throw new Error('useVista necesita <VistaProvider>')
  return valor
}
