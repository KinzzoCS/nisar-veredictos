import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictJsonUrl, verdictsApi, type Lang, type SeriesInfo, type Verdict } from './api/client'
import { hasOpticalScene, mapOptionsFor } from './api/mapOptions'
import {
  ESTADOS,
  buscar,
  claveVeredicto,
  descargarTexto,
  markdownHistoria,
  nombreArchivo,
  type Filtro,
  type Historia,
  type HistoriaNueva,
} from './comunidad/historias'
import { AtlasMap } from './components/AtlasMap'
import { Buscador } from './components/Buscador'
import { Comunidad } from './components/Comunidad'
import { EventQuery } from './components/EventQuery'
import { Evidencia } from './components/Evidencia'
import { Interprete } from './components/Interprete'
import { BarraRecogible, BotonRecoger, CabeceraPanel } from './components/Barra'
import { Esqueleto } from './components/Esqueleto'
import { BotonIcono, Icono, type NombreIcono } from './components/Iconos'
import { LanguageSwitch } from './components/LanguageSwitch'
import { LeyendaEstados, Marca } from './components/Marca'
import { Reproductor } from './components/Reproductor'
import { SesionBoton } from './components/SesionBoton'
import { Story } from './components/Story'
import { SyntheticBanner } from './components/SyntheticBadge'
import { VerdictCard } from './components/VerdictCard'
import { authApi, detalle, useSesion } from './sesion/sesion'
import { SesionProvider } from './sesion/SesionProvider'
import { VistaProvider } from './vista/VistaContexto'
import { useVista } from './vista/vista'
import type { CapaRadar } from './mapa/tipos'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; aoi: string; series: SeriesInfo[] }

/** Veredictos de todas las series, con el idioma en que se pidieron. */
type Todos = { lang: Lang; status: 'ready' | 'error'; items: Verdict[]; fallidas: string[] }

/** Pestañas de la barra derecha (T-FAR-21, RF-INT-27). */
type PestanaDer = 'hallazgos' | 'historia' | 'evento' | 'comunidad'
const PESTANAS_DER: PestanaDer[] = ['hallazgos', 'historia', 'evento', 'comunidad']
const ICONO_PESTANA: Record<PestanaDer, NombreIcono> = {
  hallazgos: 'hallazgos',
  historia: 'historia',
  evento: 'evento',
  comunidad: 'comunidad',
}
const CAPAS: CapaRadar[] = ['state', 'change_hh', 'change_hv']

/** Milisegundos que se queda cada par al reproducir una historia (RF-INT-30). */
const PASO_REPRODUCCION = 4000

/** Pantalla estrecha (móvil): las barras empiezan recogidas y solo una lateral a la vez (RF-INT-26). */
function pantallaEstrecha(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 40rem)').matches
}

type Reproduccion = { titulo: string; claves: string[]; indice: number; enMarcha: boolean }

async function loadSeries(): Promise<Load> {
  const aois = await verdictsApi.GET('/aois')
  const aoi = aois.data?.[0]
  if (!aoi) return { status: 'error' }
  const series = await verdictsApi.GET('/aois/{aoi}/series', { params: { path: { aoi } } })
  return series.data ? { status: 'ready', aoi, series: series.data } : { status: 'error' }
}

/** Primer par consecutivo de la primera serie; si no hay, el primero que haya. */
function defaultPair(items: Verdict[], series: SeriesInfo[]): Verdict | undefined {
  const primera = items.filter((v) => v.series === series[0]?.id)
  return primera.find((v) => v.kind === 'consecutive') ?? primera[0] ?? items[0]
}

export default function App() {
  return (
    <SesionProvider>
      <VistaProvider>
        <Contenido />
      </VistaProvider>
    </SesionProvider>
  )
}

/**
 * Pestañas verticales de la barra derecha (patrón ARIA de pestañas, orientación vertical): flechas arriba y
 * abajo cambian de pestaña. Pulsar la activa con el panel abierto lo recoge (RF-INT-27).
 */
function PestanasDer({
  activa,
  abierta,
  onElegir,
}: {
  activa: PestanaDer
  abierta: boolean
  onElegir: (k: PestanaDer) => void
}) {
  const { t } = useTranslation()
  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const i = PESTANAS_DER.indexOf(activa)
    const sig = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : null
    if (sig === null) return
    e.preventDefault()
    const k = PESTANAS_DER[(sig + PESTANAS_DER.length) % PESTANAS_DER.length]
    onElegir(k)
    document.getElementById(`derecha-tab-${k}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={t('layout.right')} aria-orientation="vertical" className="pestanas-der vidrio" onKeyDown={teclas}>
      {PESTANAS_DER.map((k) => (
        <button
          key={k}
          id={`derecha-tab-${k}`}
          type="button"
          role="tab"
          aria-selected={abierta && activa === k}
          aria-controls={`derecha-panel-${k}`}
          aria-expanded={abierta && activa === k}
          tabIndex={activa === k ? 0 : -1}
          title={t(`layout.tabs.${k}`)}
          onClick={() => onElegir(k)}
        >
          {/* Solo icono a la vista; el nombre de la pestaña lo lee el lector de pantalla. */}
          <Icono nombre={ICONO_PESTANA[k]} tamano={22} />
          <span className="sr-solo">{t(`layout.tabs.${k}`)}</span>
        </button>
      ))}
    </div>
  )
}

function PanelPestana({ clave, activa, children }: { clave: PestanaDer; activa: PestanaDer; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`derecha-panel-${clave}`}
      aria-labelledby={`derecha-tab-${clave}`}
      hidden={activa !== clave}
      className="panel-pestana"
    >
      {children}
    </div>
  )
}

function Contenido() {
  const { t, i18n } = useTranslation()
  const { vista } = useVista()
  const { cabeceras } = useSesion()
  const publica = vista === 'public'
  const lang: Lang = i18n.language === 'en' ? 'en' : 'es'

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [todos, setTodos] = useState<Todos>()
  const [filtro, setFiltro] = useState<Filtro>({ series: 'all', desde: '', hasta: '', estados: [...ESTADOS], ventanas: false })
  const [seleccion, setSeleccion] = useState<string>()
  const [pestanaDer, setPestanaDer] = useState<PestanaDer>('hallazgos')
  const [abierta, setAbierta] = useState<Historia | null>(null)
  const [version, setVersion] = useState(0)

  // Barras recogibles (RF-INT-26): en escritorio abren Filtros y Hallazgos; en móvil, todas recogidas.
  const [estrecha] = useState(pantallaEstrecha)
  const [barraArriba, setBarraArriba] = useState(false)
  const [barraAbajo, setBarraAbajo] = useState(false)
  const [barraIzq, setBarraIzq] = useState(!estrecha)
  const [barraDer, setBarraDer] = useState(!estrecha)
  // En pantalla estrecha cada lateral ocupa el ancho: abrir una recoge la otra.
  const abrirIzq = (a: boolean) => {
    setBarraIzq(a)
    if (a && pantallaEstrecha()) setBarraDer(false)
  }
  const abrirDer = (a: boolean) => {
    setBarraDer(a)
    if (a && pantallaEstrecha()) setBarraIzq(false)
  }
  function elegirPestanaDer(k: PestanaDer) {
    if (barraDer && k === pestanaDer) return abrirDer(false)
    setPestanaDer(k)
    abrirDer(true)
  }

  // Herramientas del mapa (RF-INT-28).
  const [modo3d, setModo3d] = useState(true)
  const [capa, setCapa] = useState<CapaRadar>('state')
  const [opacidad, setOpacidad] = useState(0.85)
  const [encuadre, setEncuadre] = useState(0)
  const [comparar, setComparar] = useState(false)
  const [capasAbiertas, setCapasAbiertas] = useState(false)
  const [completa, setCompleta] = useState(false)
  useEffect(() => {
    const alCambiar = () => setCompleta(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])
  function pantallaCompleta() {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  // Reproducción de una historia de la comunidad (RF-INT-30).
  const [reproduccion, setReproduccion] = useState<Reproduccion | null>(null)

  useEffect(() => {
    loadSeries()
      .then(setState)
      .catch(() => setState({ status: 'error' }))
  }, [])

  const aoi = state.status === 'ready' ? state.aoi : undefined
  const series = useMemo(() => (state.status === 'ready' ? state.series : []), [state])

  // Veredictos de todas las series. Se vuelven a pedir al cambiar de idioma: los textos llegan con `lang`.
  useEffect(() => {
    if (!aoi || series.length === 0) return
    let current = true
    Promise.all(
      series.map((s) =>
        verdictsApi
          .GET('/aois/{aoi}/series/{series_id}/verdicts', { params: { path: { aoi, series_id: s.id }, query: { lang } } })
          .then(({ data }) => ({ id: s.id, data }))
          .catch(() => ({ id: s.id, data: undefined })),
      ),
    ).then((rs) => {
      if (!current) return
      const items = rs.flatMap((r) => r.data ?? [])
      const fallidas = rs.filter((r) => !r.data).map((r) => r.id)
      setTodos({ lang, status: fallidas.length === rs.length ? 'error' : 'ready', items, fallidas })
      setSeleccion((prev) => (prev && items.some((v) => claveVeredicto(v) === prev) ? prev : (() => {
        const d = defaultPair(items, series)
        return d && claveVeredicto(d)
      })()))
    })
    return () => {
      current = false
    }
  }, [aoi, series, lang])

  // Mientras llega la respuesta en otro idioma, el mapa y la lista siguen con la anterior (tapados).
  const cargando = !todos || todos.lang !== lang
  const items = useMemo(() => todos?.items ?? [], [todos])
  const porClave = useMemo(() => new Map(items.map((v) => [claveVeredicto(v), v])), [items])
  const resultados = useMemo(() => buscar(items, filtro), [items, filtro])
  // Mientras se reproduce una historia, el par elegido es el que toca; la barra derecha se queda en la historia.
  const claveReproducida = reproduccion?.claves[reproduccion.indice]
  const elegida = claveReproducida ?? seleccion
  const verdict = elegida ? porClave.get(elegida) : undefined
  const verdictSeries = series.find((s) => s.id === verdict?.series)
  const synthetic = series.some((s) => s.data_kind === 'synthetic') || verdict?.receipt.data_kind === 'synthetic'

  const mapOptions = useMemo(
    () => (aoi && verdictSeries && verdict ? mapOptionsFor(aoi, verdictSeries, verdict, lang) : null),
    [aoi, verdictSeries, verdict, lang],
  )

  // Elegir un par lo enseña en el mapa y abre Hallazgos con su tarjeta.
  function seleccionar(v: Verdict) {
    setSeleccion(claveVeredicto(v))
    setPestanaDer('hallazgos')
    abrirDer(true)
  }

  function reproducir(pares: Verdict[]) {
    const orden = [...pares].sort((x, y) => x.from_date.localeCompare(y.from_date) || x.to_date.localeCompare(y.to_date))
    if (!orden.length || !abierta) return
    setReproduccion({ titulo: abierta.title, claves: orden.map(claveVeredicto), indice: 0, enMarcha: true })
  }

  // Al cerrar, el último par reproducido se queda elegido.
  function cerrarReproduccion() {
    if (claveReproducida) setSeleccion(claveReproducida)
    setReproduccion(null)
  }

  useEffect(() => {
    if (!reproduccion?.enMarcha) return
    const id = window.setTimeout(() => {
      setReproduccion((r) =>
        !r ? r : r.indice < r.claves.length - 1 ? { ...r, indice: r.indice + 1 } : { ...r, enMarcha: false },
      )
    }, PASO_REPRODUCCION)
    return () => window.clearTimeout(id)
  }, [reproduccion])
  const paresReproducidos = useMemo(
    () => (reproduccion ? reproduccion.claves.flatMap((k) => porClave.get(k) ?? []) : []),
    [reproduccion, porClave],
  )

  // Desde la historia de Parral: elige ese par y lo enseña en el mapa.
  function showPair(nextSeries: string, nextPair: string) {
    const v = porClave.get(`${nextSeries}/${nextPair}`)
    if (v) seleccionar(v)
  }

  const guardar = useCallback(
    async (h: HistoriaNueva): Promise<string | null> => {
      const { data, error } = await authApi.POST('/stories', { body: h, headers: cabeceras() })
      if (!data) return detalle(error) ?? t('community.error')
      setVersion((n) => n + 1)
      return null
    },
    [cabeceras, t],
  )

  const descargar = useCallback(
    async (h: HistoriaNueva | Historia, pares: Verdict[]) => {
      let datos: HistoriaNueva | Historia = h
      if ('id' in h) {
        // Una historia guardada cuenta la descarga en auth (RF-ACC-14) y se descarga como está guardada.
        const { data } = await authApi.POST('/stories/{story_id}/download', {
          params: { path: { story_id: h.id } },
          headers: cabeceras(),
        })
        if (data) datos = data
      }
      const lista = datos.pairs.map((p) => ({ par: p, veredicto: pares.find((v) => v.series === p.series && v.id === p.pair) ?? porClave.get(`${p.series}/${p.pair}`) }))
      descargarTexto(nombreArchivo(datos.title), markdownHistoria(datos, lista, t, lang, new Date()))
    },
    [cabeceras, lang, porClave, t],
  )

  function abrirHistoria(h: Historia) {
    setAbierta(h)
    setReproduccion(null)
    setPestanaDer('comunidad')
    setFiltro((f) => ({ ...f, series: h.series, desde: h.from_date, hasta: h.to_date }))
  }

  const intro = publica && (
    <section className="intro-publico" aria-labelledby="intro-heading">
      <h2 id="intro-heading">{t('public.question')}</h2>
      <p className="intro-lead">{t('public.lead')}</p>
      <LeyendaEstados />
    </section>
  )

  const listo = state.status === 'ready' && aoi
  const estadoApi = state.status === 'ready' ? 'online' : state.status === 'error' ? 'offline' : 'connecting'

  return (
    <div
      className="app-vidrio"
      data-izq={barraIzq}
      data-der={barraDer}
      data-arriba={barraArriba}
      data-abajo={barraAbajo}
      data-reproduciendo={Boolean(reproduccion)}
    >
      <a className="skip-link" href="#main">
        {t('app.skipToMain')}
      </a>

      {/* Barra superior: marca, buscador de ubicación (próximamente), estado de la API, idioma y cuenta. */}
      <BarraRecogible lado="arriba" id="barra-arriba" nombre={t('layout.top')} abierta={barraArriba} onCambiar={setBarraArriba}>
        <header className="app-header">
          <div className="app-marca">
            <span className="app-marcas" aria-hidden="true">
              <Marca estado="change_probable" />
              <Marca estado="no_detectable_change" />
              <Marca estado="not_observable" />
            </span>
            <div>
              <h1>{t('app.title')}</h1>
              <p className="muted app-lema">{t('app.tagline')}</p>
            </div>
            <span className="app-separador" aria-hidden="true" />
            <Icono nombre="satelite" tamano={26} />
          </div>
          {/* La API no tiene geocodificador: el campo se ve, pero no busca (RF-INT-29). */}
          <div className="buscador-ubicacion" title={t('geocoder.soon')}>
            <Icono nombre="buscar" />
            <input type="search" disabled placeholder={t('geocoder.placeholder')} aria-label={t('geocoder.label')} />
            <span className="pronto">{t('geocoder.soon')}</span>
          </div>
          {/* Solo idioma y cuenta: la vista sale del perfil de la sesión y el tema es oscuro (specs/08-interfaz). */}
          <div className="app-controls">
            <p className="estado-api" data-estado={estadoApi} role="status">
              <span className="estado-api-punto" aria-hidden="true" />
              {t(`status.${estadoApi}`)}
            </p>
            <LanguageSwitch />
            <SesionBoton />
            <BotonRecoger lado="arriba" abierta nombre={t('layout.top')} controla="barra-arriba" onCambiar={setBarraArriba} />
          </div>
        </header>
      </BarraRecogible>

      {/* Fuera de las barras: el aviso de datos sintéticos no se puede recoger (RF-INT-32). */}
      {synthetic && (
        <div className="aviso-fijo">
          <SyntheticBanner />
        </div>
      )}

      {/* Barra izquierda: Filtros (búsqueda de veredictos con línea de tiempo y resultados). */}
      <BarraRecogible lado="izq" id="panel-izq" nombre={t('layout.filters')} abierta={barraIzq} onCambiar={abrirIzq}>
        <aside className="panel-izq" aria-labelledby="titulo-filtros">
          <CabeceraPanel icono="filtros" titulo={t('layout.filters')} idTitulo="titulo-filtros">
            <BotonRecoger lado="izq" abierta nombre={t('layout.filters')} controla="panel-izq" onCambiar={abrirIzq} />
          </CabeceraPanel>
          <div className="panel-cuerpo">
            {state.status === 'loading' && <Esqueleto etiqueta={t('series.loading')} variante="lista" filas={6} />}
            {state.status === 'error' && (
              <p role="alert" className="estado-carga">
                {t('series.error')}
              </p>
            )}
            {listo && (
              <Buscador
                series={series}
                filtro={filtro}
                onFiltro={(f) => {
                  setFiltro(f)
                  setAbierta(null)
                  setReproduccion(null)
                  // Si el par elegido queda fuera de la búsqueda, se pasa al primero que sí está.
                  const nuevos = buscar(items, f)
                  if (nuevos.length && !nuevos.some((v) => claveVeredicto(v) === seleccion)) {
                    setSeleccion(claveVeredicto(nuevos[0]))
                  }
                }}
                resultados={cargando ? [] : resultados}
                seleccion={elegida}
                onSeleccionar={(v) => {
                  setReproduccion(null)
                  seleccionar(v)
                }}
                cargando={cargando}
                error={todos?.status === 'error'}
                plegarAvanzado={publica}
              />
            )}
            <footer className="muted pie">
              <p>{t('footer.attribution')}</p>
              <p>{t('footer.license')}</p>
            </footer>
          </div>
        </aside>
      </BarraRecogible>

      <main id="main" tabIndex={-1} className="zona-principal">
        {/* El mapa, siempre de fondo y a pantalla completa (RF-INT-24). */}
        <div className="fondo-mapa">
          {mapOptions && verdict && (
            <AtlasMap
              options={mapOptions}
              compare={comparar}
              canCompare={vista === 'researcher' && hasOpticalScene(verdict)}
              busy={cargando}
              modo3d={modo3d}
              layer={capa}
              opacity={opacidad}
              reframe={encuadre}
            />
          )}
        </div>

        {/* Barra derecha: un solo panel con cuatro pestañas verticales pegadas al borde (RF-INT-27). */}
        <div className="lateral-der" data-abierta={barraDer}>
          <div id="panel-der" className="lateral-der-panel vidrio" hidden={!barraDer}>
            <PanelPestana clave="hallazgos" activa={pestanaDer}>
              <CabeceraPanel icono="hallazgos" titulo={t('layout.tabs.hallazgos')}>
                <BotonRecoger lado="der" abierta nombre={t('layout.tabs.hallazgos')} controla="panel-der" onCambiar={abrirDer} />
              </CabeceraPanel>
              <div className="panel-cuerpo" aria-busy={cargando}>
                {state.status === 'error' && <p role="alert">{t('series.error')}</p>}
                {todos?.fallidas.length ? <p role="alert">{t('picker.error')}</p> : null}
                {!cargando && items.length === 0 && todos?.status === 'ready' && <p>{t('picker.empty')}</p>}
                {!verdict && state.status !== 'error' && (
                  <Esqueleto etiqueta={t('picker.loading')} variante="tarjeta" filas={5} />
                )}
                {verdict && (
                  <>
                    <VerdictCard verdict={verdict} />
                    {!publica && <Evidencia verdict={verdict} explicar={vista === 'student'} />}
                    {vista === 'researcher' && (
                      <p className="enlace-json">
                        <a href={verdictJsonUrl(verdict, lang)} target="_blank" rel="noreferrer">
                          {t('evidence.json')}
                        </a>
                      </p>
                    )}
                  </>
                )}
              </div>
            </PanelPestana>
            <PanelPestana clave="historia" activa={pestanaDer}>
              <CabeceraPanel icono="historia" titulo={t('layout.tabs.historia')}>
                <BotonRecoger lado="der" abierta nombre={t('layout.tabs.historia')} controla="panel-der" onCambiar={abrirDer} />
              </CabeceraPanel>
              <div className="panel-cuerpo">
                {intro}
                {listo && <Story aoi={aoi} lang={lang} onShowPair={showPair} />}
              </div>
            </PanelPestana>
            <PanelPestana clave="evento" activa={pestanaDer}>
              <CabeceraPanel icono="evento" titulo={t('layout.tabs.evento')}>
                <BotonRecoger lado="der" abierta nombre={t('layout.tabs.evento')} controla="panel-der" onCambiar={abrirDer} />
              </CabeceraPanel>
              <div className="panel-cuerpo">{listo && <EventQuery aoi={aoi} lang={lang} />}</div>
            </PanelPestana>
            <PanelPestana clave="comunidad" activa={pestanaDer}>
              <CabeceraPanel icono="comunidad" titulo={t('layout.tabs.comunidad')}>
                <BotonRecoger lado="der" abierta nombre={t('layout.tabs.comunidad')} controla="panel-der" onCambiar={abrirDer} />
              </CabeceraPanel>
              <div className="panel-cuerpo">
                {listo && (
                  <>
                    <Interprete
                      aoi={aoi}
                      filtro={filtro}
                      resultados={cargando ? [] : resultados}
                      abierta={abierta}
                      todos={porClave}
                      onCerrar={() => {
                        setAbierta(null)
                        setReproduccion(null)
                      }}
                      onGuardar={guardar}
                      onDescargar={descargar}
                      onReproducir={reproducir}
                    />
                    <Comunidad aoi={aoi} version={version} onAbrir={abrirHistoria} onDescargar={(h) => descargar(h, [])} />
                  </>
                )}
              </div>
            </PanelPestana>
          </div>
          <PestanasDer activa={pestanaDer} abierta={barraDer} onElegir={elegirPestanaDer} />
        </div>
      </main>

      {reproduccion && (
        <Reproductor
          titulo={reproduccion.titulo}
          pares={paresReproducidos}
          indice={reproduccion.indice}
          enMarcha={reproduccion.enMarcha}
          onIr={(i) => setReproduccion((r) => (r ? { ...r, indice: Math.max(0, Math.min(i, r.claves.length - 1)) } : r))}
          onAlternar={() =>
            setReproduccion((r) =>
              !r ? r : r.enMarcha ? { ...r, enMarcha: false } : { ...r, enMarcha: true, indice: r.indice >= r.claves.length - 1 ? 0 : r.indice },
            )
          }
          onCerrar={cerrarReproduccion}
        />
      )}

      {/* Barra inferior: herramientas del mapa (RF-INT-28). */}
      <BarraRecogible lado="abajo" id="barra-abajo" nombre={t('layout.tools')} abierta={barraAbajo} onCambiar={setBarraAbajo}>
        <nav className="herramientas" aria-label={t('layout.tools')}>
          <div className="segmentado" role="group" aria-label={t('tools.projection')}>
            <button type="button" aria-pressed={modo3d} title={t('tools.view3d')} onClick={() => setModo3d(true)}>
              <Icono nombre="cubo" />
              <span aria-hidden="true">3D</span>
              <span className="sr-solo">{t('tools.view3d')}</span>
            </button>
            <button type="button" aria-pressed={!modo3d} title={t('tools.view2d')} onClick={() => setModo3d(false)}>
              <Icono nombre="plano" />
              <span aria-hidden="true">2D</span>
              <span className="sr-solo">{t('tools.view2d')}</span>
            </button>
          </div>
          <span className="herramientas-separador" aria-hidden="true" />
          <BotonIcono icono="centrar" etiqueta={t('tools.reframe')} disabled={!mapOptions} onClick={() => setEncuadre((n) => n + 1)} />
          {!publica && (
            <div className="capas-caja">
              <BotonIcono
                icono="capas"
                etiqueta={t('tools.layers')}
                aria-expanded={capasAbiertas}
                aria-controls="capas-panel"
                onClick={() => setCapasAbiertas((a) => !a)}
              />
              <div id="capas-panel" className="capas-panel vidrio" hidden={!capasAbiertas}>
                <fieldset>
                  <legend>{t('tools.layer')}</legend>
                  {CAPAS.map((c) => (
                    <label key={c}>
                      <input type="radio" name="capa-radar" checked={capa === c} onChange={() => setCapa(c)} />
                      {t(`tools.layerNames.${c}`)}
                    </label>
                  ))}
                </fieldset>
                <label className="capas-opacidad">
                  {t('tools.opacity')}
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={opacidad}
                    onChange={(e) => setOpacidad(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          )}
          {vista === 'researcher' && verdict && hasOpticalScene(verdict) && (
            <BotonIcono icono="comparar" etiqueta={t('map.compare')} aria-pressed={comparar} onClick={() => setComparar((c) => !c)} />
          )}
          <BotonIcono
            icono="pantalla"
            etiqueta={t(completa ? 'tools.exitFullscreen' : 'tools.fullscreen')}
            aria-pressed={completa}
            onClick={pantallaCompleta}
          />
          <span className="herramientas-separador" aria-hidden="true" />
          <BotonRecoger lado="abajo" abierta nombre={t('layout.tools')} controla="barra-abajo" onCambiar={setBarraAbajo} />
        </nav>
      </BarraRecogible>
    </div>
  )
}
