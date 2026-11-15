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
import { BotonTema } from './components/BotonTema'
import { Esqueleto } from './components/Esqueleto'
import { Icono, type NombreIcono } from './components/Iconos'
import { LanguageSwitch } from './components/LanguageSwitch'
import { LeyendaEstados, Marca } from './components/Marca'
import { SesionBoton } from './components/SesionBoton'
import { Story } from './components/Story'
import { SyntheticBanner } from './components/SyntheticBadge'
import { VerdictCard } from './components/VerdictCard'
import { authApi, detalle, useSesion } from './sesion/sesion'
import { SesionProvider } from './sesion/SesionProvider'
import { VistaProvider } from './vista/VistaContexto'
import { useVista } from './vista/vista'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; aoi: string; series: SeriesInfo[] }

/** Veredictos de todas las series, con el idioma en que se pidieron. */
type Todos = { lang: Lang; status: 'ready' | 'error'; items: Verdict[]; fallidas: string[] }

type Panel = 'buscar' | 'ver' | 'guardar'
type Pestana = 'mapa' | 'historia' | 'evento'
type PestanaDer = 'interprete' | 'comunidad'

/** Icono de cada pestaña y de cada panel de la barra de abajo. */
const ICONO_PESTANA: Record<Pestana | PestanaDer, NombreIcono> = {
  mapa: 'mapa',
  historia: 'historia',
  evento: 'evento',
  interprete: 'interprete',
  comunidad: 'comunidad',
}
const ICONO_PANEL: Record<'buscar' | 'ver' | 'guardar', NombreIcono> = { buscar: 'buscar', ver: 'ver', guardar: 'guardar' }

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

/** Pestañas accesibles: flechas izquierda y derecha cambian de pestaña (patrón ARIA de pestañas). */
function Pestanas<K extends string>({
  etiqueta,
  claves,
  activa,
  onCambiar,
  texto,
  icono,
  idBase,
}: {
  etiqueta: string
  claves: K[]
  activa: K
  onCambiar: (k: K) => void
  texto: (k: K) => string
  icono: (k: K) => NombreIcono
  idBase: string
}) {
  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const i = claves.indexOf(activa)
    const sig = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
    if (sig === null) return
    e.preventDefault()
    const k = claves[(sig + claves.length) % claves.length]
    onCambiar(k)
    document.getElementById(`${idBase}-tab-${k}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={etiqueta} className="pestanas" onKeyDown={teclas}>
      {claves.map((k) => (
        <button
          key={k}
          id={`${idBase}-tab-${k}`}
          type="button"
          role="tab"
          aria-selected={activa === k}
          aria-controls={`${idBase}-panel-${k}`}
          tabIndex={activa === k ? 0 : -1}
          title={texto(k)}
          onClick={() => onCambiar(k)}
        >
          {/* Solo icono a la vista; el nombre de la pestaña lo lee el lector de pantalla. */}
          <Icono nombre={icono(k)} />
          <span className="sr-solo">{texto(k)}</span>
        </button>
      ))}
    </div>
  )
}

function PanelPestana({ idBase, clave, activa, children }: { idBase: string; clave: string; activa: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${clave}`}
      aria-labelledby={`${idBase}-tab-${clave}`}
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
  const [panel, setPanel] = useState<Panel>('ver')
  // Público abre en la historia de Parral (RF-INT-03) y las demás vistas en el mapa. La vista llega con la
  // sesión, que se comprueba después del primer render: hasta que la persona elige pestaña, sigue a la vista.
  const [pestanaElegida, setPestana] = useState<Pestana | null>(null)
  const pestana: Pestana = pestanaElegida ?? (publica ? 'historia' : 'mapa')
  const [pestanaDer, setPestanaDer] = useState<PestanaDer>('interprete')
  const [abierta, setAbierta] = useState<Historia | null>(null)
  const [version, setVersion] = useState(0)

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
  const verdict = seleccion ? porClave.get(seleccion) : undefined
  const verdictSeries = series.find((s) => s.id === verdict?.series)
  const synthetic = series.some((s) => s.data_kind === 'synthetic') || verdict?.receipt.data_kind === 'synthetic'

  const mapOptions = useMemo(
    () => (aoi && verdictSeries && verdict ? mapOptionsFor(aoi, verdictSeries, verdict, lang) : null),
    [aoi, verdictSeries, verdict, lang],
  )

  function seleccionar(v: Verdict) {
    setSeleccion(claveVeredicto(v))
    setPestana('mapa')
    setPanel('ver')
  }

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
    setPestanaDer('interprete')
    setFiltro((f) => ({ ...f, series: h.series, desde: h.from_date, hasta: h.to_date }))
  }

  const intro = publica && (
    <section className="intro-publico" aria-labelledby="intro-heading">
      <h2 id="intro-heading">{t('public.question')}</h2>
      <p className="intro-lead">{t('public.lead')}</p>
      <LeyendaEstados />
    </section>
  )

  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skipToMain')}
      </a>
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
        </div>
        {/* Solo idioma y cuenta: la vista sale del perfil de la sesión y el tema, del sistema (specs/08-interfaz). */}
        <div className="app-controls">
          <LanguageSwitch />
          <BotonTema />
          <SesionBoton />
        </div>
      </header>
      {synthetic && <SyntheticBanner />}

      {state.status === 'loading' && (
        <div className="shell shell-cargando" aria-busy="true">
          <div className="panel-izq">
            <Esqueleto etiqueta={t('series.loading')} variante="lista" filas={6} />
          </div>
          <div className="panel-centro">
            <Esqueleto etiqueta="" variante="bloque" />
            <Esqueleto etiqueta="" variante="tarjeta" />
          </div>
          <div className="panel-der">
            <Esqueleto etiqueta="" variante="lista" filas={4} />
          </div>
        </div>
      )}
      {state.status === 'error' && (
        <p role="alert" className="estado-carga">
          {t('series.error')}
        </p>
      )}

      {state.status === 'ready' && aoi && (
        <div className="shell" data-panel={panel}>
          <aside className="panel-izq" aria-label={t('layout.left')}>
            <Buscador
              series={series}
              filtro={filtro}
              onFiltro={(f) => {
                setFiltro(f)
                setAbierta(null)
                // Si el par elegido queda fuera de la búsqueda, se pasa al primero que sí está.
                const nuevos = buscar(items, f)
                if (nuevos.length && !nuevos.some((v) => claveVeredicto(v) === seleccion)) {
                  setSeleccion(claveVeredicto(nuevos[0]))
                }
              }}
              resultados={cargando ? [] : resultados}
              seleccion={seleccion}
              onSeleccionar={seleccionar}
              cargando={cargando}
              error={todos?.status === 'error'}
              plegarAvanzado={publica}
            />
            <footer className="muted pie">
              <p>{t('footer.attribution')}</p>
              <p>{t('footer.license')}</p>
            </footer>
          </aside>

          <main id="main" tabIndex={-1} className="panel-centro">
            <Pestanas
              etiqueta={t('layout.center')}
              idBase="centro"
              claves={['mapa', 'historia', 'evento'] as Pestana[]}
              activa={pestana}
              onCambiar={setPestana}
              texto={(k) => t(`layout.tabs.${k}`)}
              icono={(k) => ICONO_PESTANA[k]}
            />
            <PanelPestana idBase="centro" clave="mapa" activa={pestana}>
              <div className="vista-mapa">
                <div className="vista-mapa-mapa">
                  {!(mapOptions && verdict) && !todos?.fallidas.length && (
                    <Esqueleto etiqueta={t('picker.loading')} variante="bloque" />
                  )}
                  {mapOptions && verdict && (
                    <AtlasMap
                      options={mapOptions}
                      canCompare={vista === 'researcher' && hasOpticalScene(verdict)}
                      layerControls={!publica}
                      busy={cargando}
                    />
                  )}
                </div>
                <div className="vista-mapa-detalle" aria-busy={cargando}>
                  {todos?.fallidas.length ? (
                    <p role="alert">{t('picker.error')}</p>
                  ) : null}
                  {!cargando && items.length === 0 && todos?.status === 'ready' && <p>{t('picker.empty')}</p>}
                  {!verdict && cargando && <Esqueleto etiqueta={t('picker.loading')} variante="tarjeta" filas={5} />}
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
              </div>
            </PanelPestana>
            <PanelPestana idBase="centro" clave="historia" activa={pestana}>
              {intro}
              <Story aoi={aoi} lang={lang} onShowPair={showPair} />
            </PanelPestana>
            <PanelPestana idBase="centro" clave="evento" activa={pestana}>
              <EventQuery aoi={aoi} lang={lang} />
            </PanelPestana>
          </main>

          <aside className="panel-der" aria-label={t('layout.right')}>
            <Pestanas
              etiqueta={t('layout.right')}
              idBase="derecha"
              claves={['interprete', 'comunidad'] as PestanaDer[]}
              activa={pestanaDer}
              onCambiar={setPestanaDer}
              texto={(k) => t(`layout.tabs.${k}`)}
              icono={(k) => ICONO_PESTANA[k]}
            />
            <PanelPestana idBase="derecha" clave="interprete" activa={pestanaDer}>
              <Interprete
                aoi={aoi}
                filtro={filtro}
                resultados={cargando ? [] : resultados}
                abierta={abierta}
                todos={porClave}
                onCerrar={() => setAbierta(null)}
                onGuardar={guardar}
                onDescargar={descargar}
              />
            </PanelPestana>
            <PanelPestana idBase="derecha" clave="comunidad" activa={pestanaDer}>
              <Comunidad
                aoi={aoi}
                version={version}
                onAbrir={abrirHistoria}
                onDescargar={(h) => descargar(h, [])}
              />
            </PanelPestana>
          </aside>

          <nav className="barra-paneles" aria-label={t('layout.switcher')}>
            {(['buscar', 'ver', 'guardar'] as Panel[]).map((p) => (
              <button
                key={p}
                type="button"
                className="boton-icono"
                aria-pressed={panel === p}
                aria-label={t(`layout.panels.${p}`)}
                title={t(`layout.panels.${p}`)}
                onClick={() => setPanel(p)}
              >
                <Icono nombre={ICONO_PANEL[p]} tamano={22} />
              </button>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}
