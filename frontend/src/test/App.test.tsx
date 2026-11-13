import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import App from '../App'
import i18n from '../i18n'
import { makeVerdict } from './fixtures'

// MapLibre necesita WebGL, que jsdom no tiene: el ciclo de vida del mapa se prueba en AtlasMap.test.
const crearMapa = vi.hoisted(() =>
  vi.fn(() => ({ actualizar: vi.fn(), destruir: vi.fn(), fijarOpacidad: vi.fn(), encuadrar: vi.fn() })),
)
vi.mock('../mapa/mapa', () => ({ crearMapa }))

type Kind = 'real' | 'synthetic'

function seriesList(kind: Kind) {
  return [
    {
      id: 'T048A-F015',
      bbox: [-105.8, 26.8, -105.5, 27.0],
      data_kind: kind,
      dates: ['2026-06-17', '2026-06-29', '2026-07-11'],
      maturity: 'PROVISIONAL',
    },
    {
      id: 'T171D-F075',
      bbox: [-105.8, 26.8, -105.5, 27.0],
      data_kind: kind,
      dates: ['2026-06-26', '2026-07-08'],
      maturity: 'PROVISIONAL',
    },
  ]
}

function verdictsFor(series: string, lang: string, kind: Kind) {
  const word = lang === 'en' ? 'Between' : 'Entre'
  const receipt = { data_kind: kind, series }
  if (series === 'T171D-F075') {
    return [
      makeVerdict({
        id: '20260626_20260708',
        series,
        from_date: '2026-06-26',
        to_date: '2026-07-08',
        state: 'not_observable',
        cause: 'outside_scene',
        cause_label: 'la zona queda fuera de la pasada',
        hypotheses: [],
        receipt,
      }),
    ]
  }
  return [
    makeVerdict({ id: '20260617_20260711', kind: 'full_window', to_date: '2026-07-11', receipt }),
    makeVerdict({
      summary: { detected: `${word} A`, does_not_prove: 'n', missing: 'm' },
      receipt,
    }),
    makeVerdict({
      id: '20260629_20260711',
      from_date: '2026-06-29',
      to_date: '2026-07-11',
      state: 'no_detectable_change',
      hypotheses: [],
      receipt,
    }),
  ]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(kind: Kind = 'real', failVerdicts = false) {
  const fetch = vi.fn(async (input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const path = url.pathname
    if (path.endsWith('/api/verdicts/aois')) return json(['parral'])
    if (path.endsWith('/api/verdicts/aois/parral/series')) return json(seriesList(kind))
    const m = path.match(/\/series\/([^/]+)\/verdicts$/)
    if (m) {
      if (failVerdicts) return json({ detail: 'boom' }, 500)
      return json(verdictsFor(m[1], url.searchParams.get('lang') ?? 'es', kind))
    }
    return json({ detail: 'Not Found' }, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeEach(async () => {
  await i18n.changeLanguage('es')
})

afterEach(() => vi.unstubAllGlobals())

test('abre con el primer par consecutivo de la primera serie', async () => {
  stubApi()
  render(<App />)
  expect(await screen.findByRole('heading', { name: /Cambio probable/ })).toBeInTheDocument()
  expect(screen.getByText('Entre A')).toBeInTheDocument()
  expect(screen.getByLabelText('Serie')).toHaveValue('T048A-F015')
  expect(screen.getByLabelText('Par de fechas')).toHaveValue('20260617_20260629')
  expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
  expect(crearMapa).toHaveBeenLastCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ dataKind: 'real', idioma: 'es', compare: 'off' }),
  )
})

test('cambia de par y de serie solo con el teclado', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })

  await user.selectOptions(screen.getByLabelText('Par de fechas'), '20260629_20260711')
  expect(screen.getByRole('heading', { name: /Sin cambio detectable/ })).toBeInTheDocument()

  const series = screen.getByLabelText('Serie')
  series.focus()
  await user.selectOptions(series, 'T171D-F075')
  expect(await screen.findByRole('heading', { name: /No observable/ })).toBeInTheDocument()
  expect(screen.getByText('Motivo de que no se pudiera medir: la zona queda fuera de la pasada')).toBeInTheDocument()
})

test('vuelve a pedir los veredictos en inglés al cambiar de idioma', async () => {
  const user = userEvent.setup()
  const fetch = stubApi()
  render(<App />)
  await screen.findByText('Entre A')
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(await screen.findByText('Between A')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Probable change/ })).toBeInTheDocument()
  const urls = fetch.mock.calls.map(([r]) => (typeof r === 'string' ? r : r.url))
  expect(urls.some((u) => u.includes('lang=en'))).toBe(true)
  expect(document.documentElement.lang).toBe('en')
})

test('con datos sintéticos hay un aviso fijo arriba y otro en la tarjeta', async () => {
  stubApi('synthetic')
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  const banner = screen.getByRole('note')
  expect(banner).toHaveTextContent('Datos sintéticos')
  expect(within(banner).queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText('Este veredicto usa datos sintéticos.')).toBeInTheDocument()
})

test('con datos reales no hay aviso de sintéticos', async () => {
  stubApi('real')
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(screen.queryByText(/sintéticos/i, { selector: 'p' })).not.toBeInTheDocument()
})

test('si fallan los veredictos avisa y no muestra ninguna tarjeta', async () => {
  stubApi('real', true)
  render(<App />)
  // La historia también está en la página y puede avisar de lo suyo: se busca el aviso de los veredictos.
  expect(await screen.findByText(/No se pudieron cargar los veredictos/)).toHaveAttribute('role', 'alert')
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

test('avisa si la API no responde', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network'))))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API')
})
