import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import App from '../App'
import i18n from '../i18n'
import axe from 'axe-core'
import { makeVerdict } from './fixtures'

// MapLibre necesita WebGL, que jsdom no tiene: el ciclo de vida del mapa se prueba en AtlasMap.test.
const crearMapa = vi.hoisted(() =>
  vi.fn(() => ({ actualizar: vi.fn(), destruir: vi.fn(), fijarOpacidad: vi.fn(), encuadrar: vi.fn(), mostrarMundo: vi.fn(), volarA: vi.fn() })),
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

/** Historia de la comunidad con la forma de contracts/auth.openapi.json. */
function storyOut(over: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    title: 'Junio en Parral',
    aoi: 'parral',
    series: 'all',
    from_date: '2026-06-17',
    to_date: '2026-07-11',
    pairs: [
      { series: 'T048A-F015', pair: '20260629_20260711' },
      { series: 'T048A-F015', pair: '20260617_20260629' },
    ],
    notes: 'Miré el centro.',
    author_role: 'researcher',
    created_at: '2026-11-14T18:00:00Z',
    downloads: 2,
    ratings: {
      count: 3,
      average: 4.33,
      by_role: { student: { count: 1, average: 5 }, researcher: { count: 2, average: 4 } },
    },
    is_mine: false,
    my_stars: null,
    ...over,
  }
}

/** Historia sintética de la zona que devuelve el doble de /api/research/stories. */
const HISTORIA_ZONA = {
  id: 'S-zona',
  research_id: 'R-zona',
  title: 'Historia de prueba de Hidalgo del Parral',
  data_kind: 'synthetic',
  traceability: { ok: true },
  evidence: [{ id: 'event:prueba', kind: 'external_source', label: 'Tormenta de prueba', urls: ['https://example.invalid/boletin'] }],
  chapters: [
    { key: 'title', title: 'Título', claims: [], map: null },
    { key: 'events', title: 'Acontecimientos relacionados', claims: [{ text: '2026-07-01: tormenta de prueba.', evidence: ['event:prueba'], kind: 'statement' }], map: { bbox: [-105.75, 26.87, -105.6, 26.98] } },
    { key: 'findings', title: 'Hallazgos', claims: [{ text: 'Sin hallazgos de prueba.', evidence: [], kind: 'statement' }], map: { aoi: 'parral', series: 'T048A-F015', pair_id: '20260629_20260711' } },
  ],
}

/** Lugares de prueba de /api/research/places: uno dentro de la zona procesada y otro lejos. */
const LUGARES = [
  { id: 'parral', name: 'Hidalgo del Parral, Chihuahua', bbox: [-105.75, 26.87, -105.6, 26.98], source: 'config/aois/parral.yaml' },
  { id: 'helheim', name: 'Glaciar Helheim, Groenlandia', bbox: [-38.6, 66.25, -38.0, 66.5], source: 'delimitación propia' },
]

/** Pasadas de prueba de /api/catalog/search/world: dos órbitas sobre la zona pedida. */
function pasadasMundo(bbox: string) {
  const g = (i: number, track: number, direction: 'A' | 'D') => ({
    id: `G${i}`,
    acquired_at: `2026-10-${10 + i}T12:00:00Z`,
    track,
    direction,
    frame: 20,
    mode: '4005',
    polarization: 'DHDH',
    size_mb: 7000,
    footprint: [[-38.7, 66.2], [-37.9, 66.2], [-37.9, 66.6], [-38.7, 66.6], [-38.7, 66.2]],
    bbox: [-38.7, 66.2, -37.9, 66.6],
    data_url: 'https://example.invalid/x.h5',
    browse_url: null,
    thumbnail_url: null,
    vertex_url: 'https://search.asf.alaska.edu/',
    earthdata_search_url: 'https://search.earthdata.nasa.gov/',
    collection_concept_id: null,
  })
  return {
    bbox: bbox.split(',').map(Number),
    from: '2025-11-15',
    to: '2026-11-15',
    direction: null,
    collection: 'NISAR_L2_GCOV_PROVISIONAL_V1',
    data_kind: 'real',
    sources: [],
    total: 3,
    granules: [g(1, 12, 'A'), g(2, 12, 'A'), g(3, 99, 'D')],
  }
}

interface Opciones {
  kind?: Kind
  failVerdicts?: boolean
  /** off: AUTH_ENABLED=0 (503 en /api/auth/); on: se puede entrar. */
  auth?: 'off' | 'on'
  /** Sesión abierta al cargar (la cookie de renovación), con este perfil. Implica auth on. */
  perfil?: 'student' | 'researcher'
}

function token(role: string) {
  return { access_token: 'tok', token_type: 'Bearer', expires_in: 900, role, email_verified: false }
}

function stubApi({ kind = 'real', failVerdicts = false, auth = 'off', perfil }: Opciones = {}) {
  if (perfil) auth = 'on'
  // La app solo pide /refresh al arrancar si el navegador tiene la marca de una sesión anterior (SesionProvider).
  if (perfil) localStorage.setItem('sesion-posible', '1')
  else localStorage.removeItem('sesion-posible')
  const enviados: { path: string; method: string; body: unknown; authorization: string | null }[] = []
  const fetch = vi.fn(async (input: Request | string, init?: RequestInit) => {
    // Con una URL de texto, el método y el cuerpo llegan en init (los componentes nuevos llaman así a fetch).
    const request = typeof input === 'string' ? new Request(input, init) : input
    const url = new URL(request.url)
    const path = url.pathname
    if (path.startsWith('/api/auth/')) {
      const body = request.method === 'GET' ? null : await request.clone().text().then((t) => (t ? JSON.parse(t) : null))
      enviados.push({ path, method: request.method, body, authorization: request.headers.get('Authorization') })
      if (auth === 'off') return json({ detail: 'El acceso con cuenta está desactivado' }, 503)
      if (path.endsWith('/refresh')) return perfil ? json(token(perfil)) : json({ detail: 'Sin sesión' }, 401)
      if (path.endsWith('/logout')) return new Response(null, { status: 204 })
      if (path.endsWith('/login')) return json(token('student'))
      if (path.endsWith('/stories') && request.method === 'GET') return json({ stories: [storyOut()], total: 1 })
      if (path.endsWith('/stories') && request.method === 'POST') return json(storyOut({ id: 'h2', is_mine: true, ...(body as object) }), 201)
      if (path.endsWith('/rating')) return json(storyOut({ my_stars: (body as { stars: number }).stars }))
      return json({ detail: 'Not Found' }, 404)
    }
    if (path.endsWith('/api/research/research') && request.method === 'POST') return json({ id: 'R-zona' }, 201)
    if (path.endsWith('/api/research/research/R-zona/status'))
      return json({ id: 'R-zona', job: { id: 'J', state: 'done', step: null, error: null }, story_ids: ['S-zona'] })
    if (path.endsWith('/api/research/stories/S-zona')) return json({ ...HISTORIA_ZONA, data_kind: kind === 'synthetic' ? 'synthetic' : 'real_or_catalog' })
    if (path.endsWith('/api/online/zones') && request.method === 'POST') return json({ id: 'z-prueba' }, 202)
    if (path.endsWith('/api/online/zones/z-prueba'))
      return json({ id: 'z-prueba', state: 'no_processable_series', step: null, bbox: [-38.6, 66.25, -38.0, 66.5], max_dates: 4,
        steps: { zone: 'done (0 s)', series: 'failed (0 s)', fetch: 'pending', dem: 'pending', process: 'pending' },
        series: null, series_found: [{ id: 'T126D-F055-7700-SHNA-P05023', polarization: 'SHNA', dates: 9 }], log: [], error: 'sin HH y HV' })
    if (path.endsWith('/api/research/places')) {
      const q = url.searchParams.get('q') ?? ''
      return json({ query: q, geocoder: 'ok', results: LUGARES.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())) })
    }
    if (path.endsWith('/api/catalog/search/world')) return json(pasadasMundo(url.searchParams.get('bbox') ?? ''))
    if (path.endsWith('/api/catalog/aois')) return json([{ id: 'parral', name: 'Hidalgo del Parral, Chihuahua', bbox: [-105.95, 26.7, -105.4, 27.15] }])
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
  return Object.assign(fetch, { enviados })
}

beforeEach(async () => {
  await i18n.changeLanguage('es')
})

afterEach(() => vi.unstubAllGlobals())

/** Abre una barra recogible desde su pestaña del borde (T-FAR-21). */
async function abrirBarra(user: ReturnType<typeof userEvent.setup>, nombre: 'barra superior' | 'Herramientas del mapa' | 'Filtros') {
  // Desde el vidrio líquido (3b604a4) las barras empiezan abiertas: solo se pulsa si está recogida.
  const abrir = screen.queryByRole('button', { name: `Abrir ${nombre}` })
  if (abrir) await user.click(abrir)
}

function resultado(nombre: RegExp) {
  return within(screen.getByRole('region', { name: 'Buscar veredictos' })).getByRole('button', { name: nombre })
}

/** Entra con el formulario del icono de la cuenta (el doble de la API da el perfil estudiante). */
async function entrarComoEstudiante(user: ReturnType<typeof userEvent.setup>) {
  if (document.getElementById('barra-arriba')?.hidden) await abrirBarra(user, 'barra superior')
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  const dialogo = screen.getByRole('dialog', { name: 'Iniciar sesión' })
  await user.type(within(dialogo).getByLabelText('Correo'), 'ana@example.org')
  await user.type(within(dialogo).getByLabelText(/Contraseña/), 'una frase larga cualquiera')
  await user.click(within(dialogo).getByRole('button', { name: 'Iniciar sesión' }))
  expect(await screen.findByRole('button', { name: 'Cuenta: estudiante' })).toBeInTheDocument()
}

test('con sesión de investigación abre con el primer par consecutivo de la primera serie, en Hallazgos', async () => {
  stubApi({ perfil: 'researcher' })
  render(<App />)
  expect(await screen.findByRole('heading', { name: /Cambio probable/ })).toBeInTheDocument()
  expect(within(screen.getByRole('tabpanel', { name: 'Hallazgos' })).getByText('Entre A')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked()
  expect(resultado(/2026-06-17 → 2026-06-29/)).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('tab', { name: 'Hallazgos' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
  // El mapa abre en el globo, sin botón 3D ni selector de capas propios: los da la barra inferior.
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ dataKind: 'real', idioma: 'es', compare: 'off', modo3d: true, control3d: false, controlCapas: false }),
    ),
  )
})

test('el mapa va de fondo y las barras se recogen en su borde: al cargar están todas abiertas', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  expect(screen.getByRole('complementary', { name: 'Filtros' })).toBeInTheDocument()
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('tabpanel', { name: 'Hallazgos' })).toBeVisible()
  // Superior e inferior también empiezan abiertas (vidrio líquido, 3b604a4); recogerlas deja su pestaña.
  expect(document.getElementById('barra-arriba')).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Herramientas del mapa' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Recoger barra superior' }))
  expect(document.getElementById('barra-arriba')).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Abrir barra superior' })).toHaveAttribute('aria-expanded', 'false')
  await abrirBarra(user, 'barra superior')
  expect(document.getElementById('barra-arriba')).toBeVisible()

  const herramientas = screen.getByRole('navigation', { name: 'Herramientas del mapa' })
  expect(within(herramientas).getByRole('button', { name: 'Globo en 3D' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(within(herramientas).getByRole('button', { name: 'Mapa plano en 2D' }))
  expect(within(herramientas).getByRole('button', { name: 'Mapa plano en 2D' })).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() => expect(crearMapa.mock.results.at(-1)!.value.actualizar).toHaveBeenLastCalledWith({ modo3d: false }))

  // Recoger Filtros deja la pestaña del borde y le pasa el foco.
  await user.click(screen.getByRole('button', { name: 'Recoger Filtros' }))
  expect(screen.queryByRole('complementary', { name: 'Filtros' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Abrir Filtros' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('complementary', { name: 'Filtros' })).toBeInTheDocument()

  // La pestaña activa de la derecha recoge su panel; otra lo vuelve a abrir en ella.
  await user.click(screen.getByRole('tab', { name: 'Hallazgos' }))
  expect(screen.queryByRole('tabpanel', { name: 'Hallazgos' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '¿Pudo verlo?' }))
  expect(screen.getByRole('tab', { name: '¿Pudo verlo?' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel', { name: '¿Pudo verlo?' })).toBeVisible()
})

test('la cabecera lleva el estado de la API, el buscador de lugares, el idioma y la cuenta', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await abrirBarra(user, 'barra superior')
  const cabecera = document.querySelector<HTMLElement>('header.app-header')!
  expect(within(cabecera).getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
  expect(within(cabecera).getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(within(cabecera).getByText('En línea')).toBeInTheDocument()
  // Buscador de lugares (2026-11-15): sustituye al campo «Próximamente» y a la pestaña Mundo.
  expect(within(cabecera).getByRole('combobox', { name: 'Buscar un lugar' })).toBeEnabled()
  expect(screen.queryByRole('tab', { name: 'Mundo' })).not.toBeInTheDocument()
  // Tema solo oscuro (RF-INT-23): sin botón de tema ni selector de vista.
  expect(within(cabecera).queryByRole('button', { name: /tema/ })).not.toBeInTheDocument()
  expect(within(cabecera).queryByRole('group', { name: 'Vista' })).not.toBeInTheDocument()
  expect(document.documentElement.dataset.tema).toBeUndefined()
})

test('los botones de acción solo llevan icono, con nombre accesible y descripción emergente', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  // Los veredictos ya no esperan a la sesión: la renovación puede llegar después.
  await screen.findByRole('button', { name: 'Cuenta: investigador o investigadora' })
  await abrirBarra(user, 'barra superior')
  await abrirBarra(user, 'Herramientas del mapa')
  await user.click(screen.getByRole('tab', { name: 'Comunidad' }))
  const acciones = [
    screen.getByRole('button', { name: 'Cuenta: investigador o investigadora' }),
    screen.getByRole('tab', { name: 'Hallazgos' }),
    screen.getByRole('tab', { name: 'Comunidad' }),
    screen.getByRole('button', { name: 'Guardar historia' }),
    screen.getByRole('button', { name: 'Recoger Filtros' }),
    screen.getByRole('button', { name: 'Volver a encuadrar la zona' }),
    screen.getByRole('button', { name: 'Capas del radar' }),
  ]
  for (const b of acciones) {
    // Sin texto visible: solo el icono (y, en las pestañas, el nombre oculto para el lector de pantalla).
    const visible = Array.from(b.childNodes).filter((n) => !(n instanceof Element && n.classList.contains('sr-solo')))
    expect(visible.map((n) => n.textContent).join('').trim(), b.outerHTML).toBe('')
    expect(b.querySelector('svg.icono')).not.toBeNull()
    // Descripción emergente: `title` en los botones; las pestañas la pintan en CSS desde `data-etiqueta` (vidrio.css).
    expect(b.getAttribute('title') || b.getAttribute('data-etiqueta'), b.outerHTML).toBeTruthy()
  }
})

test('el selector de capas de la barra cambia la capa y la opacidad del mapa', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  await abrirBarra(user, 'Herramientas del mapa')
  const capas = screen.getByRole('button', { name: 'Capas del radar' })
  await user.click(capas)
  expect(capas).toHaveAttribute('aria-expanded', 'true')
  await user.click(screen.getByRole('radio', { name: 'Cambio en HV' }))
  const m = crearMapa.mock.results.at(-1)!.value
  await waitFor(() => expect(m.actualizar).toHaveBeenLastCalledWith({ activeLayer: 'change_hv' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Opacidad' }), { target: { value: '0.5' } })
  await waitFor(() => expect(m.fijarOpacidad).toHaveBeenLastCalledWith(0.5))
})

test('mientras cargan los veredictos se ven esqueletos que anuncian la carga', async () => {
  stubApi({ perfil: 'researcher' })
  render(<App />)
  const cargas = await screen.findAllByRole('status')
  expect(cargas.some((c) => c.classList.contains('esqueleto') && /Cargando/.test(c.textContent ?? ''))).toBe(true)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(document.querySelector('.panel-izq .esqueleto')).toBeNull()
})

test('elige otro par en la lista y filtra por serie, solo con el teclado', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })

  resultado(/2026-06-29 → 2026-07-11/).focus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('heading', { name: /Sin cambio detectable/ })).toBeInTheDocument()

  await user.click(screen.getByRole('radio', { name: /T171/ }))
  expect(screen.getByRole('heading', { name: '1 veredicto' })).toBeInTheDocument()
  resultado(/2026-06-26 → 2026-07-08/).focus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('heading', { name: /No observable/ })).toBeInTheDocument()
  expect(screen.getByText('Motivo de que no se pudiera medir: la zona queda fuera de la pasada')).toBeInTheDocument()
})

test('el buscador filtra por rango de fechas, por estado y con ventanas completas', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.getByRole('heading', { name: '3 veredictos' })).toBeInTheDocument()

  // «Desde» también está en la pestaña Mundo: se busca dentro de Filtros.
  const filtros = () => within(screen.getByRole('complementary', { name: 'Filtros' }))
  fireEvent.change(filtros().getByLabelText('Desde'), { target: { value: '2026-06-26' } })
  expect(screen.getByRole('heading', { name: '2 veredictos' })).toBeInTheDocument()
  // El par elegido (17 al 29 de junio) queda fuera: se pasa al primero de la búsqueda.
  expect(resultado(/2026-06-26 → 2026-07-08/)).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { name: /No observable/ })).toBeInTheDocument()

  await user.click(screen.getByRole('checkbox', { name: 'No observable' }))
  expect(screen.getByRole('heading', { name: '1 veredicto' })).toBeInTheDocument()

  fireEvent.change(filtros().getByLabelText('Desde'), { target: { value: '' } })
  await user.click(screen.getByRole('switch', { name: /Incluir ventanas completas/ }))
  expect(resultado(/2026-06-17 → 2026-07-11.*ventana completa/)).toBeInTheDocument()
})

test('vuelve a pedir los veredictos en inglés al cambiar de idioma', async () => {
  const user = userEvent.setup()
  const fetch = stubApi({ perfil: 'researcher' })
  render(<App />)
  await within(await screen.findByRole('tabpanel', { name: 'Hallazgos' })).findByText('Entre A')
  await abrirBarra(user, 'barra superior')
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(await within(screen.getByRole('tabpanel', { name: 'Findings' })).findByText('Between A')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Probable change/ })).toBeInTheDocument()
  const urls = fetch.mock.calls.map(([r]) => (typeof r === 'string' ? r : r.url))
  expect(urls.some((u) => u.includes('lang=en'))).toBe(true)
  expect(document.documentElement.lang).toBe('en')
})

test('con datos sintéticos hay un aviso fijo arriba y otro en la tarjeta', async () => {
  stubApi({ kind: 'synthetic', perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  const banner = screen.getByRole('note')
  expect(banner).toHaveTextContent('Datos sintéticos')
  expect(within(banner).queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText('Este veredicto usa datos sintéticos.')).toBeInTheDocument()
})

test('con datos reales no hay aviso de sintéticos', async () => {
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
  expect(screen.queryByText(/sintéticos/i, { selector: 'p' })).not.toBeInTheDocument()
})

test('si fallan los veredictos avisa y no muestra ninguna tarjeta', async () => {
  stubApi({ failVerdicts: true, perfil: 'researcher' })
  render(<App />)
  const avisos = await screen.findAllByText(/No se pudieron cargar los veredictos/)
  expect(avisos[0]).toHaveAttribute('role', 'alert')
  expect(screen.queryByRole('heading', { name: /Cambio probable/ })).not.toBeInTheDocument()
})

test('avisa si la API no responde', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('network'))))
  render(<App />)
  const avisos = await screen.findAllByRole('alert')
  expect(avisos[0]).toHaveTextContent('No se pudo conectar con la API')
})

test('el enlace para saltar al contenido es lo primero con el tabulador y lleva a main', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
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
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await abrirBarra(user, 'barra superior')
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(document.title).toBe(i18n.t('app.title', { lng: 'en' }))
  expect(document.documentElement.lang).toBe('en')
})

test('las pestañas de la derecha se recorren con las flechas arriba y abajo', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  screen.getByRole('tab', { name: 'Hallazgos' }).focus()
  await user.keyboard('{ArrowDown}')
  const historia = screen.getByRole('tab', { name: 'Historia de la zona' })
  expect(historia).toHaveFocus()
  expect(historia).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel', { name: 'Historia de la zona' })).toBeVisible()
  // Desde Historia, dos arriba: Hallazgos y, dando la vuelta, la última pestaña (Comunidad).
  await user.keyboard('{ArrowUp}{ArrowUp}')
  expect(screen.getByRole('tab', { name: 'Comunidad' })).toHaveAttribute('aria-selected', 'true')
})

// T-FAR-07: axe-core sin infracciones WCAG 2.0/2.1 A y AA. jsdom no calcula colores,
// así que el contraste se mide aparte en el navegador.
describe.each([
  ['es', 'real', undefined],
  ['en', 'synthetic', undefined],
  ['es', 'synthetic', 'student'],
  ['en', 'real', 'researcher'],
] as const)('accesibilidad automática (%s, datos %s, perfil %s)', (lang, kind, perfil) => {
  test('axe no encuentra infracciones', async () => {
    await i18n.changeLanguage(lang)
    stubApi({ kind, perfil })
    const { container } = render(<App />)
    await waitFor(() => expect(crearMapa).toHaveBeenCalled())
    const results = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    const found = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    expect(found).toEqual([])
  }, 20_000) // axe recorre todo el DOM: con todas las pruebas en paralelo pasa de los 5 s por defecto.
})

// Vista desde el perfil de la sesión (specs/08-interfaz, cambio del 2026-11-14; RF-INT-02 y 03).
const PERFILES = [undefined, 'student', 'researcher'] as const

test('sin cuenta se ve todo: Hallazgos primero, la historia a un clic, filtros y capas sin plegar', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  // Desde el rediseño de vidrio (RF-INT-26) la primera pantalla es el mapa con Hallazgos.
  expect(screen.getByRole('tab', { name: 'Hallazgos' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('tab', { name: 'Historia de la zona' }))
  expect(screen.getByRole('heading', { level: 2, name: HISTORIA_ZONA.title })).toBeInTheDocument()
  // La historia es la de la zona activa, generada por research con su evidencia (ya no la fija de Parral).
  expect(await screen.findByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
  // Desde el 2026-11-14 la información no depende de la sesión: nada plegado y con selector de capas.
  expect(screen.queryByText('Más filtros', { selector: 'summary' })).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Estados' })).toBeInTheDocument()
  await abrirBarra(user, 'Herramientas del mapa')
  expect(screen.getByRole('button', { name: 'Capas del radar' })).toBeInTheDocument()
})

test('entrar y salir no cambia lo que se ve: la cuenta solo sirve para publicar y valorar', async () => {
  const user = userEvent.setup()
  stubApi({ auth: 'on' })
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await user.click(screen.getByRole('tab', { name: 'Historia de la zona' }))
  await screen.findByRole('heading', { level: 2, name: HISTORIA_ZONA.title })
  await entrarComoEstudiante(user)

  expect(screen.getByRole('heading', { level: 2, name: HISTORIA_ZONA.title })).toBeInTheDocument()
  expect(screen.queryByText('Más filtros')).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Estados' })).toBeInTheDocument()
  await abrirBarra(user, 'Herramientas del mapa')
  expect(screen.getByRole('button', { name: 'Capas del radar' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Cuenta: estudiante' }))
  const cuenta = screen.getByRole('dialog', { name: 'Tu cuenta' })
  expect(within(cuenta).getByText('Sesión de estudiante')).toBeInTheDocument()
  await user.click(within(cuenta).getByRole('button', { name: 'Salir' }))
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: HISTORIA_ZONA.title })).toBeInTheDocument()
})

test('con cualquier perfil están el estado, los tres textos, el distintivo y el recibo, y la tarjeta es idéntica', async () => {
  const textos: (string | null)[] = []
  for (const perfil of PERFILES) {
    stubApi({ kind: 'synthetic', perfil })
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Buscar veredictos' })
    const card = await screen.findByRole('article', { name: /Cambio probable/ })
    for (const label of ['Qué detectamos', 'Qué no prueba', 'Qué falta']) {
      expect(within(card).getByText(label), `${perfil}: ${label}`).toBeInTheDocument()
    }
    expect(within(card).getByText('Este veredicto usa datos sintéticos.')).toBeInTheDocument()
    expect(within(card).getByText('Recibo: de dónde sale esta respuesta')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Datos sintéticos')
    textos.push(card.textContent)
    unmount()
    vi.unstubAllGlobals()
  }
  expect(new Set(textos).size).toBe(1)
})

// Diseño en blanco y negro (2026-11-14): la evidencia va fuera de la tarjeta, que no cambia entre vistas.
test('la evidencia explicada y el enlace al JSON se ven igual sin cuenta y con cualquier perfil', async () => {
  for (const perfil of PERFILES) {
    stubApi({ perfil })
    const { unmount } = render(<App />)
    const tabla = await screen.findByRole('region', { name: 'Evidencia' })
    expect(within(tabla).getByRole('rowheader', { name: /Fracción con cambio/ })).toBeInTheDocument()
    expect(within(tabla).getByText('4,1 % de lo observado')).toBeInTheDocument()
    expect(within(tabla).getByText(/El decibelio \(dB\)/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /JSON/ })).toHaveAttribute(
      'href',
      'http://localhost:8080/api/verdicts/aois/parral/series/T048A-F015/verdicts/20260617_20260629?lang=es',
    )
    unmount()
    vi.unstubAllGlobals()
  }
})

// Historias de la comunidad (RF-ACC-13 a 17, T-ANT-20).
/** El intérprete vive en la pestaña Comunidad de la barra derecha (T-FAR-21). */
async function interprete(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole('tabpanel', { name: 'Comunidad' })) await user.click(screen.getByRole('tab', { name: 'Comunidad' }))
  return screen.getByRole('tabpanel', { name: 'Comunidad' })
}

test('el intérprete arma el borrador con los textos de la API y, sin acceso, no deja guardar', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: '3 veredictos' })
  const panel = await interprete(user)
  expect(
    within(panel).getByText('3 pares: 1 con cambio probable, 1 sin cambio detectable y 1 sin poder observarse.'),
  ).toBeInTheDocument()
  expect(within(panel).getByText('Entre A')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Guardar historia' })).toBeDisabled()
  expect(within(panel).getAllByText(/AUTH_ENABLED=0/).length).toBeGreaterThan(0)
})

test('con sesión se guarda una historia con referencias y notas, sin textos de veredictos', async () => {
  const user = userEvent.setup()
  const fetch = stubApi({ auth: 'on' })
  render(<App />)
  await screen.findByRole('heading', { name: '3 veredictos' })
  await entrarComoEstudiante(user)

  const panel = await interprete(user)
  await user.click(within(panel).getByRole('checkbox', { name: /2026-06-26 al 2026-07-08/ }))
  await user.type(within(panel).getByLabelText('Tus notas'), 'Mis notas')
  await user.click(within(panel).getByRole('button', { name: 'Guardar historia' }))
  expect(await within(panel).findByText(/Historia guardada/)).toBeInTheDocument()

  const post = fetch.enviados.find((e) => e.path === '/api/auth/stories' && e.method === 'POST')!
  expect(post.authorization).toBe('Bearer tok')
  expect(post.body).toEqual({
    title: 'Hidalgo del Parral, Chihuahua, Todas las series, del 2026-06-17 al 2026-07-11',
    aoi: 'parral',
    series: 'all',
    from_date: '2026-06-17',
    to_date: '2026-07-11',
    pairs: [
      { series: 'T048A-F015', pair: '20260617_20260629' },
      { series: 'T048A-F015', pair: '20260629_20260711' },
    ],
    notes: 'Mis notas',
  })
})

test('la comunidad muestra las estrellas por perfil y, con sesión, deja valorar', async () => {
  const user = userEvent.setup()
  const fetch = stubApi({ auth: 'on' })
  render(<App />)
  await screen.findByRole('heading', { name: '3 veredictos' })
  await user.click(screen.getByRole('tab', { name: 'Comunidad' }))
  const historia = await screen.findByRole('article', { name: 'Junio en Parral' })
  expect(within(historia).getByText('De estudiantes').nextSibling).toHaveTextContent('5,0 (1)')
  expect(within(historia).getByText('De investigación').nextSibling).toHaveTextContent('4,0 (2)')
  expect(within(historia).queryByRole('group', { name: 'Tu valoración' })).not.toBeInTheDocument()
  expect(screen.getByText('Inicia sesión para valorar historias y publicar las tuyas.')).toBeInTheDocument()

  await entrarComoEstudiante(user)

  const valorar = await within(await screen.findByRole('article', { name: 'Junio en Parral' })).findByRole('group', {
    name: 'Tu valoración',
  })
  await user.click(within(valorar).getByRole('button', { name: '4 estrellas' }))
  await waitFor(() => expect(within(valorar).getByRole('button', { name: '4 estrellas' })).toHaveAttribute('aria-pressed', 'true'))
  const rating = fetch.enviados.find((e) => e.path.endsWith('/rating'))!
  expect(rating).toMatchObject({ method: 'POST', body: { stars: 4 }, authorization: 'Bearer tok' })
})

test('abrir una historia de la comunidad enseña sus notas aparte, rotuladas como de quien la escribió', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  await user.click(screen.getByRole('tab', { name: 'Comunidad' }))
  const historia = await screen.findByRole('article', { name: 'Junio en Parral' })
  await user.click(within(historia).getByRole('button', { name: 'Abrir' }))
  const panel = await interprete(user)
  // En la lista de la comunidad y abierta encima, en el intérprete.
  expect(within(panel).getAllByRole('heading', { name: 'Junio en Parral' })).toHaveLength(2)
  const notas = within(panel).getByRole('region', { name: 'Notas de quien la escribió' })
  expect(within(notas).getByText('No son texto de la API ni están comprobadas.')).toBeInTheDocument()
  expect(within(notas).getByText('Miré el centro.')).toBeInTheDocument()
  expect(within(panel).getByText('Entre A')).toBeInTheDocument()
})

test('reproducir una historia recorre sus pares en orden de fechas y cada uno se elige en el mapa', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  await user.click(screen.getByRole('tab', { name: 'Comunidad' }))
  const historia = await screen.findByRole('article', { name: 'Junio en Parral' })
  await user.click(within(historia).getByRole('button', { name: 'Abrir' }))
  await user.click(screen.getByRole('button', { name: 'Reproducir historia en el mapa' }))

  // La historia guarda los pares desordenados; se reproducen por fecha: primero el del 17 de junio.
  const linea = screen.getByRole('list', { name: 'Pares de la historia en el tiempo' })
  expect(screen.getByText('Par 1 de 2')).toBeInTheDocument()
  expect(within(linea).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'step')
  expect(resultado(/2026-06-17 → 2026-06-29/)).toHaveAttribute('aria-pressed', 'true')
  // La barra derecha se queda en la historia.
  expect(screen.getByRole('tab', { name: 'Comunidad' })).toHaveAttribute('aria-selected', 'true')

  await user.click(screen.getByRole('button', { name: 'Pausar' }))
  expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Par siguiente' }))
  expect(screen.getByText('Par 2 de 2')).toBeInTheDocument()
  expect(resultado(/2026-06-29 → 2026-07-11/)).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Par siguiente' })).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Cerrar la reproducción' }))
  expect(screen.queryByText('Par 2 de 2')).not.toBeInTheDocument()
})

// Buscador de lugares y filtros dinámicos (2026-11-15).
test('un lugar sin veredictos cambia los filtros a sus pasadas, con las órbitas que salen de los datos', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  const caja = screen.getByRole('combobox', { name: 'Buscar un lugar' })
  await user.type(caja, 'Helheim')
  await user.click(await screen.findByRole('option', { name: /Glaciar Helheim/ }))
  const filtros = within(screen.getByRole('complementary', { name: 'Filtros' }))
  expect(await filtros.findByRole('heading', { name: 'Glaciar Helheim, Groenlandia' })).toBeInTheDocument()
  expect(filtros.queryByRole('heading', { name: 'Buscar veredictos' })).not.toBeInTheDocument()
  // Las órbitas salen de las pasadas: T012A con 2 y T099D con 1.
  await user.click(await filtros.findByRole('button', { name: /T012A-F020 · 2/ }))
  expect(filtros.getByRole('heading', { name: /Las 2 más recientes de 3/ })).toBeInTheDocument()
  expect(crearMapa.mock.results.at(-1)!.value.volarA).toHaveBeenLastCalledWith([-38.6, 66.25, -38.0, 66.5])
  // Volver a la zona con veredictos.
  await user.click(filtros.getByRole('button', { name: /Ver veredictos de Hidalgo del Parral/ }))
  expect(await screen.findByRole('heading', { name: 'Buscar veredictos' })).toBeInTheDocument()
})

test('un lugar dentro de una zona procesada deja los filtros de veredictos', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await user.type(screen.getByRole('combobox', { name: 'Buscar un lugar' }), 'Parral')
  await user.click(await screen.findByRole('option', { name: /Hidalgo del Parral/ }))
  expect(screen.getByRole('heading', { name: 'Buscar veredictos' })).toBeInTheDocument()
  expect(crearMapa.mock.results.at(-1)!.value.volarA).toHaveBeenLastCalledWith([-105.75, 26.87, -105.6, 26.98])
})

test('la historia de la zona se reproduce sola: cada capítulo mueve el mapa y cita su fuente', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    stubApi()
    render(<App />)
    await screen.findByRole('heading', { name: 'Buscar veredictos' })
    await user.click(screen.getByRole('tab', { name: 'Historia de la zona' }))
    const panel = within(screen.getByRole('tabpanel', { name: 'Historia de la zona' }))
    expect(await panel.findByRole('heading', { level: 2, name: HISTORIA_ZONA.title })).toBeInTheDocument()
    await user.click(panel.getByText('1 evidencia'))
    expect(panel.getByRole('link', { name: /Fuente 1/ })).toHaveAttribute('href', 'https://example.invalid/boletin')
    await user.click(panel.getByRole('button', { name: 'Reproducir' }))
    expect(crearMapa.mock.results.at(-1)!.value.volarA).toHaveBeenLastCalledWith([-105.75, 26.87, -105.6, 26.98])
    await vi.advanceTimersByTimeAsync(7100)
    expect(panel.getByText('Capítulo 2 de 2')).toBeInTheDocument()
    expect(panel.getByRole('heading', { name: 'Hallazgos' })).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('un lugar sin serie con HH y HV lo dice y deja ver las pasadas', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await user.type(screen.getByRole('combobox', { name: 'Buscar un lugar' }), 'Helheim')
  await user.click(await screen.findByRole('option', { name: /Glaciar Helheim/ }))
  const filtros = within(screen.getByRole('complementary', { name: 'Filtros' }))
  expect(await filtros.findByText(/no tiene una serie con HH y HV/)).toBeInTheDocument()
  expect(filtros.getByText(/T126D-F055-7700-SHNA-P05023/)).toBeInTheDocument()
  expect(await filtros.findByRole('button', { name: /T012A-F020 · 2/ })).toBeInTheDocument()
})
