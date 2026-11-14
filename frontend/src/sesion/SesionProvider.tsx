import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ContextoSesion, authApi, detalle, type EstadoSesion, type Perfil, type TokenOut } from './sesion'

/** Renueva al 80 % de la vida del token de acceso (15 min en auth). */
const MARGEN = 0.8

/** Da la sesión a la app: comprueba la cookie al arrancar y renueva el token antes de que caduque. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'comprobando' })
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)
  // `abrir` programa la renovación y `renovar` llama a `abrir`: la referencia rompe el ciclo.
  const renovarLuego = useRef<() => void>(() => {})

  const abrir = useCallback((t: TokenOut) => {
    setSesion({ estado: 'abierta', token: t.access_token, perfil: t.role })
    clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => renovarLuego.current(), t.expires_in * 1000 * MARGEN)
  }, [])

  /** Pide un token nuevo con la cookie. 503: AUTH_ENABLED=0 en el gateway; otro error, sin sesión. */
  const renovar = useCallback(
    () =>
      authApi
        .POST('/refresh')
        .then(({ data, response }) => {
          if (data) abrir(data)
          else setSesion(response.status === 503 ? { estado: 'apagado' } : { estado: 'anonima' })
        })
        .catch(() => setSesion({ estado: 'apagado' })),
    [abrir],
  )

  useEffect(() => {
    renovarLuego.current = () => void renovar()
    void renovar()
    return () => clearTimeout(temporizador.current)
  }, [renovar])

  const entrar = useCallback(
    async (correo: string, clave: string) => {
      const { data, error } = await authApi.POST('/login', { body: { email: correo, password: clave } })
      if (data) {
        abrir(data)
        return null
      }
      return detalle(error) ?? 'error'
    },
    [abrir],
  )

  const registrar = useCallback(
    async (correo: string, clave: string, perfil: Perfil) => {
      const { data, error } = await authApi.POST('/register', { body: { email: correo, password: clave, role: perfil } })
      if (data) {
        abrir(data)
        return null
      }
      return detalle(error) ?? 'error'
    },
    [abrir],
  )

  const salir = useCallback(async () => {
    clearTimeout(temporizador.current)
    try {
      await authApi.POST('/logout')
    } finally {
      setSesion({ estado: 'anonima' })
    }
  }, [])

  const valor = useMemo(
    () => ({
      sesion,
      entrar,
      registrar,
      salir,
      cabeceras: (): Record<string, string> =>
        sesion.estado === 'abierta' ? { Authorization: `Bearer ${sesion.token}` } : {},
    }),
    [sesion, entrar, registrar, salir],
  )
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}
