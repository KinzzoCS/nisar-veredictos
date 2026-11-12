import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import App from '../App'
import i18n from '../i18n'

const series = [
  {
    id: 'T048A-F015',
    bbox: [-105.8, 26.8, -105.5, 27.0],
    data_kind: 'synthetic',
    dates: ['2026-06-17', '2026-06-29', '2026-10-15'],
    maturity: 'PROVISIONAL',
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(async () => {
  await i18n.changeLanguage('es')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/api/verdicts/aois')) return json(['parral'])
      if (url.endsWith('/api/verdicts/aois/parral/series')) return json(series)
      return json({ detail: 'Not Found' }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

test('muestra las series de la API y dice que los datos son sintéticos', async () => {
  render(<App />)
  expect(await screen.findByText('T048A-F015')).toBeInTheDocument()
  expect(screen.getByText(/3 fechas/)).toBeInTheDocument()
  expect(screen.getByText(/Datos: sintéticos/)).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
})

test('cambia a inglés con el teclado y actualiza el idioma del documento', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('T048A-F015')
  await user.tab()
  const english = screen.getByRole('button', { name: 'English' })
  while (document.activeElement !== english) await user.tab()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('heading', { name: 'Available series' })).toBeInTheDocument()
  expect(screen.getByText(/Data: synthetic/)).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('en')
  expect(english).toHaveAttribute('aria-pressed', 'true')
})

test('avisa si la API no responde', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network'))))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API')
})
