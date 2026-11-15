import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

/** Historia de la comunidad con la forma de contracts/auth.openapi.json. */
function storyOut(over: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    title: 'Junio en Parral',
    aoi: 'parral',
    series: 'all',
    from_date: '2026-06-17',
    to_date: '2026-07-11',
    pairs: [{ series: 'T048A-F015', pair: '20260617_20260629' }],
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
  const enviados: { path: string; method: string; body: unknown; authorization: string | null }[] = []
  const fetch = vi.fn(async (input: Request | string) => {
    const request = typeof input === 'string' ? new Request(input) : input
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

async function abrirMapa(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Mapa' }))
}

function resultado(nombre: RegExp) {
  return within(screen.getByRole('region', { name: 'Buscar veredictos' })).getByRole('button', { name: nombre })
}

/** Entra con el formulario del icono de la cuenta (el doble de la API da el perfil estudiante). */
async function entrarComoEstudiante(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  const dialogo = screen.getByRole('dialog', { name: 'Iniciar sesión' })
  await user.type(within(dialogo).getByLabelText('Correo'), 'ana@example.org')
  await user.type(within(dialogo).getByLabelText(/Contraseña/), 'una frase larga cualquiera')
  await user.click(within(dialogo).getByRole('button', { name: 'Iniciar sesión' }))
  expect(await screen.findByRole('button', { name: 'Cuenta: estudiante' })).toBeInTheDocument()
}

test('con sesión de investigación abre con el primer par consecutivo de la primera serie, en el mapa', async () => {
  stubApi({ perfil: 'researcher' })
  render(<App />)
  expect(await screen.findByRole('heading', { name: /Cambio probable/ })).toBeInTheDocument()
  expect(within(screen.getByRole('main')).getByText('Entre A')).toBeInTheDocument()
  expect(screen.getByLabelText('Serie')).toHaveValue('all')
  expect(resultado(/2026-06-17 → 2026-06-29/)).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('region', { name: 'Mapa' })).toBeInTheDocument()
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ dataKind: 'real', idioma: 'es', compare: 'off', controlCapas: true }),
    ),
  )
})

test('las tres zonas tienen su nombre: búsqueda, vistas y guardar', async () => {
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  expect(screen.getByRole('complementary', { name: 'Búsqueda y parámetros' })).toBeInTheDocument()
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: 'Guardar y comunidad' })).toBeInTheDocument()
  // La barra de paneles (móvil y tableta) elige cuál se ve.
  const barra = screen.getByRole('navigation', { name: 'Paneles' })
  expect(within(barra).getByRole('button', { name: 'Ver' })).toHaveAttribute('aria-pressed', 'true')
})

test('la cabecera lleva el idioma, el tema y la cuenta; no hay selector de vista', async () => {
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  const cabecera = screen.getByRole('banner')
  expect(within(cabecera).getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
  expect(within(cabecera).getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeInTheDocument()
  expect(within(cabecera).getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(within(cabecera).queryByRole('group', { name: 'Vista' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Investigador' })).not.toBeInTheDocument()
  // Sin tema guardado, el del sistema: la app no fija ninguno.
  expect(document.documentElement.dataset.tema).toBeUndefined()
})

test('el botón de tema alterna claro y oscuro, lo guarda y cambia de icono y de nombre', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await user.click(screen.getByRole('button', { name: 'Cambiar a tema oscuro' }))
  expect(document.documentElement.dataset.tema).toBe('oscuro')
  expect(localStorage.getItem('tema')).toBe('oscuro')
  await user.click(screen.getByRole('button', { name: 'Cambiar a tema claro' }))
  expect(document.documentElement.dataset.tema).toBe('claro')
  expect(localStorage.getItem('tema')).toBe('claro')
  localStorage.removeItem('tema')
  delete document.documentElement.dataset.tema
})

test('los botones de acción solo llevan icono, con nombre accesible y descripción emergente', async () => {
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  const acciones = [
    screen.getByRole('button', { name: 'Cambiar a tema oscuro' }),
    screen.getByRole('button', { name: 'Cuenta: investigador o investigadora' }),
    screen.getByRole('tab', { name: 'Mapa' }),
    screen.getByRole('tab', { name: 'Comunidad' }),
    screen.getByRole('button', { name: 'Guardar historia' }),
    within(screen.getByRole('navigation', { name: 'Paneles' })).getByRole('button', { name: 'Buscar' }),
  ]
  for (const b of acciones) {
    // Sin texto visible: solo el icono (y, en las pestañas, el nombre oculto para el lector de pantalla).
    const visible = Array.from(b.childNodes).filter((n) => !(n instanceof Element && n.classList.contains('sr-solo')))
    expect(visible.map((n) => n.textContent).join('').trim(), b.outerHTML).toBe('')
    expect(b.querySelector('svg.icono')).not.toBeNull()
    expect(b.getAttribute('title')).toBeTruthy()
  }
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

  await user.selectOptions(screen.getByLabelText('Serie'), 'T171D-F075')
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

  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-06-26' } })
  expect(screen.getByRole('heading', { name: '2 veredictos' })).toBeInTheDocument()
  // El par elegido (17 al 29 de junio) queda fuera: se pasa al primero de la búsqueda.
  expect(resultado(/2026-06-26 → 2026-07-08/)).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { name: /No observable/ })).toBeInTheDocument()

  await user.click(screen.getByRole('checkbox', { name: 'No observable' }))
  expect(screen.getByRole('heading', { name: '1 veredicto' })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } })
  await user.click(screen.getByRole('checkbox', { name: 'Incluir ventanas completas' }))
  expect(resultado(/2026-06-17 → 2026-07-11.*ventana completa/)).toBeInTheDocument()
})

test('vuelve a pedir los veredictos en inglés al cambiar de idioma', async () => {
  const user = userEvent.setup()
  const fetch = stubApi({ perfil: 'researcher' })
  render(<App />)
  await within(await screen.findByRole('main')).findByText('Entre A')
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(await within(screen.getByRole('main')).findByText('Between A')).toBeInTheDocument()
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
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con la API')
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
  await user.click(screen.getByRole('button', { name: 'English' }))
  expect(document.title).toBe(i18n.t('app.title', { lng: 'en' }))
  expect(document.documentElement.lang).toBe('en')
})

test('las pestañas del centro se recorren con las flechas', async () => {
  const user = userEvent.setup()
  stubApi({ perfil: 'researcher' })
  render(<App />)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  screen.getByRole('tab', { name: 'Mapa' }).focus()
  await user.keyboard('{ArrowRight}')
  const historia = screen.getByRole('tab', { name: 'Historia de Parral' })
  expect(historia).toHaveFocus()
  expect(historia).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel', { name: 'Historia de Parral' })).toBeVisible()
  await user.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(screen.getByRole('tab', { name: '¿Pudo verlo?' })).toHaveAttribute('aria-selected', 'true')
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

test('sin cuenta la vista es Público: la historia primero y lo avanzado plegado', async () => {
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  expect(screen.getByRole('tab', { name: 'Historia de Parral' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { level: 2, name: '¿Qué pasó en Parral?' })).toBeInTheDocument()
  // Las siglas de la primera pantalla van explicadas.
  expect(screen.getByText(/Estados Unidos \(NASA\) y de la India \(ISRO\)/)).toBeInTheDocument()
  const mas = screen.getByText('Más filtros', { selector: 'summary' }).closest('details') as HTMLDetailsElement
  expect(mas.open).toBe(false)
  expect(screen.queryByRole('button', { name: /Comparar con la imagen/ })).not.toBeInTheDocument()
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ controlCapas: false })),
  )
})

test('al entrar, la vista pasa a la del perfil y, al salir, vuelve a Público', async () => {
  const user = userEvent.setup()
  stubApi({ auth: 'on' })
  render(<App />)
  await screen.findByRole('heading', { level: 2, name: '¿Qué pasó en Parral?' })
  await entrarComoEstudiante(user)

  expect(screen.queryByRole('heading', { name: '¿Qué pasó en Parral?' })).not.toBeInTheDocument()
  // Fuera de Público, los filtros de estado se ven sin desplegar nada y el mapa lleva su selector de capas.
  expect(screen.queryByText('Más filtros')).not.toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Estados' })).toBeInTheDocument()
  // Sin pestaña elegida, el centro sigue a la vista: Estudiante abre en el mapa.
  expect(screen.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true')
  await waitFor(() =>
    expect(crearMapa).toHaveBeenLastCalledWith(expect.any(HTMLElement), expect.objectContaining({ controlCapas: true })),
  )

  await user.click(screen.getByRole('button', { name: 'Cuenta: estudiante' }))
  const cuenta = screen.getByRole('dialog', { name: 'Tu cuenta' })
  expect(within(cuenta).getByText('Sesión de estudiante')).toBeInTheDocument()
  await user.click(within(cuenta).getByRole('button', { name: 'Salir' }))
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: '¿Qué pasó en Parral?' })).toBeInTheDocument()
})

test('con cualquier perfil están el estado, los tres textos, el distintivo y el recibo, y la tarjeta es idéntica', async () => {
  const user = userEvent.setup()
  const textos: (string | null)[] = []
  for (const perfil of PERFILES) {
    stubApi({ kind: 'synthetic', perfil })
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: 'Buscar veredictos' })
    if (!perfil) await abrirMapa(user)
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
test('la evidencia aparece con perfil Estudiante (explicada) e Investigación (con el JSON), no sin cuenta', async () => {
  const user = userEvent.setup()
  stubApi()
  const publico = render(<App />)
  await screen.findByRole('heading', { name: 'Buscar veredictos' })
  await abrirMapa(user)
  await screen.findByRole('heading', { name: /Cambio probable/ })
  expect(screen.queryByRole('heading', { name: 'Evidencia' })).not.toBeInTheDocument()
  publico.unmount()

  stubApi({ perfil: 'student' })
  const estudiante = render(<App />)
  const tabla = await screen.findByRole('region', { name: 'Evidencia' })
  expect(within(tabla).getByRole('rowheader', { name: /Fracción con cambio/ })).toBeInTheDocument()
  expect(within(tabla).getByText('4,1 % de lo observado')).toBeInTheDocument()
  expect(within(tabla).getByText(/El decibelio \(dB\)/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /JSON/ })).not.toBeInTheDocument()
  estudiante.unmount()

  stubApi({ perfil: 'researcher' })
  render(<App />)
  const tablaInv = await screen.findByRole('region', { name: 'Evidencia' })
  expect(within(tablaInv).queryByText(/El decibelio/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /JSON/ })).toHaveAttribute(
    'href',
    'http://localhost:8080/api/verdicts/aois/parral/series/T048A-F015/verdicts/20260617_20260629?lang=es',
  )
})

// Historias de la comunidad (RF-ACC-13 a 17, T-ANT-20).
function interprete() {
  return screen.getByRole('tabpanel', { name: 'Intérprete' })
}

test('el intérprete arma el borrador con los textos de la API y, sin acceso, no deja guardar', async () => {
  stubApi()
  render(<App />)
  await screen.findByRole('heading', { name: '3 veredictos' })
  const panel = interprete()
  expect(
    within(panel).getByText('3 pares: 1 con cambio probable, 1 sin cambio detectable y 1 sin poder observarse.'),
  ).toBeInTheDocument()
  expect(within(panel).getByText('Entre A')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Guardar historia' })).toBeDisabled()
  expect(within(panel).getByText(/AUTH_ENABLED=0/)).toBeInTheDocument()
})

test('con sesión se guarda una historia con referencias y notas, sin textos de veredictos', async () => {
  const user = userEvent.setup()
  const fetch = stubApi({ auth: 'on' })
  render(<App />)
  await screen.findByRole('heading', { name: '3 veredictos' })
  await entrarComoEstudiante(user)

  const panel = interprete()
  await user.click(within(panel).getByRole('checkbox', { name: /2026-06-26 al 2026-07-08/ }))
  await user.type(within(panel).getByLabelText('Tus notas'), 'Mis notas')
  await user.click(within(panel).getByRole('button', { name: 'Guardar historia' }))
  expect(await within(panel).findByText(/Historia guardada/)).toBeInTheDocument()

  const post = fetch.enviados.find((e) => e.path === '/api/auth/stories' && e.method === 'POST')!
  expect(post.authorization).toBe('Bearer tok')
  expect(post.body).toEqual({
    title: 'Parral, Todas las series, del 2026-06-17 al 2026-07-11',
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
  expect(screen.getByText('Inicia sesión para descargar y valorar historias.')).toBeInTheDocument()

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
  const panel = interprete()
  expect(within(panel).getByRole('heading', { name: 'Junio en Parral' })).toBeInTheDocument()
  const notas = within(panel).getByRole('region', { name: 'Notas de quien la escribió' })
  expect(within(notas).getByText('No son texto de la API ni están comprobadas.')).toBeInTheDocument()
  expect(within(notas).getByText('Miré el centro.')).toBeInTheDocument()
  expect(within(panel).getByText('Entre A')).toBeInTheDocument()
})
