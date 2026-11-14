import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ContextoVista, guardarVista, vistaGuardada, type Vista } from './vista'

/** Da la vista a toda la app. Sin sesión (llega con T-FAR-16), empieza en la guardada o en Público. */
export function VistaProvider({ children }: { children: ReactNode }) {
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const cambiarVista = useCallback((v: Vista) => {
    setVista(v)
    guardarVista(v)
  }, [])
  const valor = useMemo(() => ({ vista, cambiarVista }), [vista, cambiarVista])
  return <ContextoVista.Provider value={valor}>{children}</ContextoVista.Provider>
}
