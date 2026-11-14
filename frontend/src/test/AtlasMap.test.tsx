import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, vi } from 'vitest'
import type { VerdictMapOptions } from '../api/mapOptions'
import { AtlasMap } from '../components/AtlasMap'
import i18n from '../i18n'

// MapLibre necesita WebGL, que jsdom no tiene: se sustituye crearMapa por un doble.
const mapa = vi.hoisted(() => {
  const instancias: { actualizar: ReturnType<typeof vi.fn>; destruir: ReturnType<typeof vi.fn> }[] = []
  const crearMapa = vi.fn(() => {
    const m = { actualizar: vi.fn(), destruir: vi.fn(), fijarOpacidad: vi.fn(), encuadrar: vi.fn() }
    instancias.push(m)
    return m
  })
  return { crearMapa, instancias }
})
vi.mock('../mapa/mapa', () => ({ crearMapa: mapa.crearMapa }))

function options(over: Partial<VerdictMapOptions> = {}): VerdictMapOptions {
  return {
    aoi: [-105.95, 26.7, -105.4, 27.15],
    nombreZona: 'Hidalgo del Parral',
    layers: { state: 'http://g/s', change_hh: 'http://g/h', change_hv: 'http://g/v' },
    dataKind: 'real',
    causaNoObservable: undefined,
    desplazamientoEscena: 'ninguno',
    idioma: 'es',
    pixelUrl: 'http://g/pixel',
    optical: { before: { status: 'clear', tiles: ['http://g/t'] }, after: { status: 'none_in_window', tiles: [] } },
    ...over,
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('es')
  mapa.crearMapa.mockClear()
  mapa.instancias.length = 0
})

test('con StrictMode deja un solo mapa vivo y lo destruye al desmontar', () => {
  const { unmount } = render(
    <StrictMode>
      <AtlasMap options={options()} canCompare={false} busy={false} />
    </StrictMode>,
  )
  const vivos = () => mapa.instancias.filter((m) => m.destruir.mock.calls.length === 0)
  expect(vivos()).toHaveLength(1)
  expect(mapa.crearMapa).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ compare: 'off' }))
  expect(vivos()[0].actualizar).not.toHaveBeenCalled()
  unmount()
  expect(vivos()).toHaveLength(0)
})

test('al cambiar de veredicto o de idioma usa actualizar() sin recrear el mapa', () => {
  const { rerender } = render(<AtlasMap options={options()} canCompare={false} busy={false} />)
  const next = options({ layers: { state: 'http://g/s2', change_hh: 'x', change_hv: 'y' }, idioma: 'en' })
  rerender(<AtlasMap options={next} canCompare={false} busy={false} />)
  expect(mapa.crearMapa).toHaveBeenCalledTimes(1)
  expect(mapa.instancias[0].actualizar).toHaveBeenCalledWith({ ...next, compare: 'off' })
})

test('el botón de comparar activa el deslizador y lo quita', async () => {
  const user = userEvent.setup()
  render(<AtlasMap options={options()} canCompare busy={false} />)
  const boton = screen.getByRole('button', { name: 'Comparar con la imagen óptica (Sentinel-2)' })
  expect(boton).toHaveAttribute('aria-pressed', 'false')
  await user.click(boton)
  expect(boton).toHaveAttribute('aria-pressed', 'true')
  // Solo el modo: reenviar las capas haría que el mapa las volviera a cargar.
  expect(mapa.instancias[0].actualizar).toHaveBeenLastCalledWith({ compare: 'swipe' })
  await user.click(boton)
  expect(mapa.instancias[0].actualizar).toHaveBeenLastCalledWith({ compare: 'off' })
})

test('sin escena óptica no ofrece comparar', () => {
  render(<AtlasMap options={options()} canCompare={false} busy={false} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('mientras carga, tapa el mapa y lo marca ocupado', () => {
  const { container, rerender } = render(<AtlasMap options={options()} canCompare={false} busy />)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando veredictos…')
  expect(container.querySelector('.atlas-map-frame')).toHaveAttribute('aria-busy', 'true')
  rerender(<AtlasMap options={options()} canCompare={false} busy={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
