import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import App from '../App'
import i18n from '../i18n'
import axe from 'axe-core'
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
  localStorage.removeItem('vista')
  localStorage.removeItem('tema')
  delete document.documentElement.dataset.tema
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
  // El mapa se monta en un efecto: con la suite cargada puede llegar después del título.
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ dataKind: 'real', idioma: 'es', compare: 'off' }),
    ),
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

test('el enlace para saltar al contenido es lo primero con el tabulador y lleva a main', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  await user.tab()
  const skip = screen.getByRole('link', { name: 'Saltar al contenido principal' })
  expect(skip).toHaveFocus()
  expect(skip).toHaveAttribute('href', '#main')
  expect(document.getElementById('main')?.tagName).toBe('MAIN')
})

test('el título del documento sigue al idioma', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByText('Entre A')
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(document.title).toBe(i18n.t('app.title', { lng: 'en' }))
  expect(document.documentElement.lang).toBe('en')
})

// T-FAR-07: axe-core sin infracciones WCAG 2.0/2.1 A y AA. jsdom no calcula colores,
// así que el contraste se mide aparte en el navegador.
describe.each([
  ['es', 'real', 'public'],
  ['en', 'synthetic', 'public'],
  ['es', 'synthetic', 'student'],
  ['en', 'real', 'researcher'],
] as const)('accesibilidad automática (%s, datos %s, vista %s)', (lang, kind, vista) => {
  test('axe no encuentra infracciones', async () => {
    await i18n.changeLanguage(lang)
    localStorage.setItem('vista', vista)
    stubApi(kind)
    const { container } = render(<App />)
    await screen.findByRole('article')
    const results = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    const found = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    expect(found).toEqual([])
  }, 20_000) // axe recorre todo el DOM: con todas las pruebas en paralelo pasa de los 5 s por defecto.
})

// T-FAR-13: selector de vista y vista Público 80/20 (RF-INT-02 y 03; plan en specs/08-interfaz/plan.md).
const VIEWS = ['Público', 'Estudiante', 'Investigador'] as const

function pliegue(nombre: string) {
  return screen.getByText(nombre, { selector: 'summary' }).closest('details') as HTMLDetailsElement
}

/** Espera a que la historia y los veredictos hayan pedido todo lo suyo. */
async function settled(fetch: ReturnType<typeof stubApi>) {
  await screen.findByRole('article', { name: /Cambio probable/ })
  let before = -1
  await waitFor(() => {
    const now = fetch.mock.calls.length
    const stable = now === before
    before = now
    expect(stable).toBe(true)
  })
}

test('sin cuenta abre en vista Público, con la pregunta primero y lo avanzado plegado', async () => {
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.getByRole('button', { name: 'Público' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { level: 2, name: '¿Qué pasó en Parral?' })).toBeInTheDocument()
  // Las siglas de la primera pantalla van explicadas.
  expect(screen.getByText(/Estados Unidos \(NASA\) y de la India \(ISRO\)/)).toBeInTheDocument()
  expect(pliegue('Elegir otra serie o par de fechas').open).toBe(false)
  expect(pliegue('Consultar otra fecha').open).toBe(false)
  expect(screen.queryByRole('button', { name: /Comparar con la imagen/ })).not.toBeInTheDocument()
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ controlCapas: false })),
  )
})

test('el selector de vista se usa con el teclado y se recuerda en el navegador', async () => {
  const user = userEvent.setup()
  stubApi()
  const { unmount } = render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  const student = screen.getByRole('button', { name: 'Estudiante' })
  student.focus()
  await user.keyboard('{Enter}')
  expect(student).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Público' })).toHaveAttribute('aria-pressed', 'false')
  expect(localStorage.getItem('vista')).toBe('student')
  expect(screen.queryByRole('heading', { name: '¿Qué pasó en Parral?' })).not.toBeInTheDocument()
  expect(pliegue('Elegir otra serie o par de fechas').open).toBe(true)
  expect(pliegue('Consultar otra fecha').open).toBe(true)
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ controlCapas: true })),
  )

  unmount()
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.getByRole('button', { name: 'Estudiante' })).toHaveAttribute('aria-pressed', 'true')
})

test('en las tres vistas están el estado, los tres textos, el distintivo y el recibo', async () => {
  const user = userEvent.setup()
  stubApi('synthetic')
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  for (const name of VIEWS) {
    await user.click(screen.getByRole('button', { name }))
    const card = screen.getByRole('article', { name: /Cambio probable/ })
    for (const label of ['Qué detectamos', 'Qué no prueba', 'Qué falta']) {
      expect(within(card).getByText(label), `${name}: ${label}`).toBeInTheDocument()
    }
    expect(within(card).getByText('Este veredicto usa datos sintéticos.')).toBeInTheDocument()
    expect(within(card).getByText('Recibo: de dónde sale esta respuesta')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Datos sintéticos')
  }
})

test('cambiar de vista no vuelve a pedir nada a la API ni cambia el veredicto', async () => {
  const user = userEvent.setup()
  const fetch = stubApi()
  render(<App />)
  await settled(fetch)
  const calls = fetch.mock.calls.length
  const text = screen.getByRole('article', { name: /Cambio probable/ }).textContent
  for (const name of ['Estudiante', 'Investigador', 'Público']) {
    await user.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('article', { name: /Cambio probable/ }).textContent).toBe(text)
  }
  await new Promise((r) => setTimeout(r, 50))
  expect(fetch.mock.calls.length).toBe(calls)
})

test('el tema se elige con un botón, se aplica en <html> y se recuerda', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  const tema = screen.getByRole('group', { name: 'Tema' })
  expect(within(tema).getByRole('button', { name: 'Del sistema' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(within(tema).getByRole('button', { name: 'Oscuro' }))
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  expect(localStorage.getItem('tema')).toBe('oscuro')
  await user.click(within(tema).getByRole('button', { name: 'Del sistema' }))
  expect(document.documentElement.dataset.tema).toBeUndefined()
  expect(localStorage.getItem('tema')).toBeNull()
})
