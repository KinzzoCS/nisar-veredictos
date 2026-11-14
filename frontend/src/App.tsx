import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictsApi, type Lang, type SeriesInfo, type Verdict } from './api/client'
import { hasOpticalScene, mapOptionsFor } from './api/mapOptions'
import { LanguageSwitch } from './components/LanguageSwitch'
import { AtlasMap } from './components/AtlasMap'
import { EventQuery } from './components/EventQuery'
import { Story } from './components/Story'
import { SyntheticBanner } from './components/SyntheticBadge'
import { VerdictCard } from './components/VerdictCard'
import { ThemeSwitch, ViewSwitch } from './components/ViewSwitch'
import { VistaProvider } from './vista/VistaContexto'
import { useVista } from './vista/vista'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; aoi: string; series: SeriesInfo[] }

type Verdicts =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Verdict[] }

/** Respuesta guardada con la petición (serie e idioma) a la que corresponde. */
type Loaded = Exclude<Verdicts, { status: 'loading' }> & { key: string; seriesId: string }

async function loadSeries(): Promise<Load> {
  const aois = await verdictsApi.GET('/aois')
  const aoi = aois.data?.[0]
  if (!aoi) return { status: 'error' }
  const series = await verdictsApi.GET('/aois/{aoi}/series', { params: { path: { aoi } } })
  return series.data ? { status: 'ready', aoi, series: series.data } : { status: 'error' }
}

/** Primer par consecutivo; si no hay, el primero que llegue. */
function defaultPair(items: Verdict[]): string | undefined {
  return (items.find((v) => v.kind === 'consecutive') ?? items[0])?.id
}

/** Pliegue que en Público empieza cerrado y en las otras vistas abierto. Su contenido sigue montado. */
function Pliegue({ abierto, onToggle, resumen, children }: {
  abierto: boolean
  onToggle: (abierto: boolean) => void
  resumen: string
  children: ReactNode
}) {
  return (
    <details className="pliegue" open={abierto} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>{resumen}</summary>
      {children}
    </details>
  )
}

export default function App() {
  return (
    <VistaProvider>
      <Contenido />
    </VistaProvider>
  )
}

function Contenido() {
  const { t, i18n } = useTranslation()
  const { vista } = useVista()
  const publica = vista === 'public'
  // Lo avanzado va plegado en Público (RF-INT-03) y desplegado en las demás vistas.
  // Al cambiar de vista se reinicia; dentro de una vista, la persona abre y cierra a su gusto.
  const [pliegues, setPliegues] = useState({ vista, picker: !publica, event: !publica })
  const abiertos = pliegues.vista === vista ? pliegues : { vista, picker: !publica, event: !publica }
  const abrir = (cual: 'picker' | 'event', abierto: boolean) =>
    setPliegues((p) => ({ ...(p.vista === vista ? p : abiertos), [cual]: abierto }))
  const lang: Lang = i18n.language === 'en' ? 'en' : 'es'
  const seriesSelect = useId()
  const pairSelect = useId()

  const [state, setState] = useState<Load>({ status: 'loading' })
  const [seriesId, setSeriesId] = useState<string>()
  const [pairId, setPairId] = useState<string>()
  const [loaded, setLoaded] = useState<Loaded>()

  useEffect(() => {
    loadSeries()
      .then((s) => {
        setState(s)
        if (s.status === 'ready') setSeriesId(s.series[0]?.id)
      })
      .catch(() => setState({ status: 'error' }))
  }, [])

  const aoi = state.status === 'ready' ? state.aoi : undefined
  const requestKey = `${seriesId}|${lang}`
  // Mientras llega la respuesta de la petición actual no se muestra la anterior.
  const verdicts: Verdicts = loaded?.key === requestKey ? loaded : { status: 'loading' }

  // Se vuelven a pedir al cambiar de serie o de idioma: los textos llegan de la API con `lang`.
  useEffect(() => {
    if (!aoi || !seriesId) return
    let current = true
    const key = `${seriesId}|${lang}`
    verdictsApi
      .GET('/aois/{aoi}/series/{series_id}/verdicts', {
        params: { path: { aoi, series_id: seriesId }, query: { lang } },
      })
      .then(({ data }) => {
        if (!current) return
        if (!data) return setLoaded({ key, seriesId, status: 'error' })
        setLoaded({ key, seriesId, status: 'ready', items: data })
        setPairId((prev) => (prev && data.some((v) => v.id === prev) ? prev : defaultPair(data)))
      })
      .catch(() => current && setLoaded({ key, seriesId, status: 'error' }))
    return () => {
      current = false
    }
  }, [aoi, seriesId, lang])

  const series = state.status === 'ready' ? state.series.find((s) => s.id === seriesId) : undefined
  const items = verdicts.status === 'ready' ? verdicts.items : []
  const verdict = items.find((v) => v.id === pairId)
  const synthetic = series?.data_kind === 'synthetic' || verdict?.receipt.data_kind === 'synthetic'

  // Desde la historia: elige ese par en el selector y lleva el foco allí.
  function showPair(nextSeries: string, nextPair: string) {
    setSeriesId(nextSeries)
    setPairId(nextPair)
    abrir('picker', true)
    // Tras el render; setTimeout también corre con la pestaña en segundo plano, requestAnimationFrame no.
    setTimeout(() => {
      const select = document.getElementById(pairSelect)
      select?.scrollIntoView({ block: 'start' })
      select?.focus()
    }, 0)
  }

  // El mapa sigue con la última respuesta mientras llega la nueva (tapado), para no recrearlo.
  const shown = loaded?.status === 'ready' ? loaded : undefined
  const mapSeries = state.status === 'ready' ? state.series.find((s) => s.id === shown?.seriesId) : undefined
  const mapVerdict = shown && (shown.items.find((v) => v.id === pairId) ?? shown.items.find((v) => v.id === defaultPair(shown.items)))
  const mapOptions = useMemo(
    () => (aoi && mapSeries && mapVerdict ? mapOptionsFor(aoi, mapSeries, mapVerdict, lang) : null),
    [aoi, mapSeries, mapVerdict, lang],
  )

  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skipToMain')}
      </a>
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <div className="app-controls">
          <ViewSwitch />
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </header>
      {synthetic && <SyntheticBanner />}

      <main id="main" tabIndex={-1}>
        {publica && (
          <section className="intro-publico" aria-labelledby="intro-heading">
            <h2 id="intro-heading">{t('public.question')}</h2>
            <p>{t('public.lead')}</p>
          </section>
        )}
        {aoi && <Story aoi={aoi} lang={lang} onShowPair={showPair} />}
        {state.status === 'loading' && <p>{t('series.loading')}</p>}
        {state.status === 'error' && <p role="alert">{t('series.error')}</p>}

        {state.status === 'ready' && (
          <section aria-labelledby="picker-heading" aria-busy={verdicts.status === 'loading'}>
            <h2 id="picker-heading">{t('picker.heading')}</h2>
            <Pliegue abierto={abiertos.picker} onToggle={(a) => abrir('picker', a)} resumen={t('picker.choose')}>
              <div className="picker">
                <label htmlFor={seriesSelect}>{t('picker.series')}</label>
                <select
                  id={seriesSelect}
                  value={seriesId ?? ''}
                  onChange={(e) => {
                    setPairId(undefined)
                    setSeriesId(e.target.value)
                  }}
                >
                  {state.series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {t(`dataKind.${s.data_kind}`)}
                    </option>
                  ))}
                </select>

                <label htmlFor={pairSelect}>{t('picker.pair')}</label>
                <select
                  id={pairSelect}
                  value={pairId ?? ''}
                  disabled={items.length === 0}
                  onChange={(e) => setPairId(e.target.value)}
                >
                  {items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.from_date} → {v.to_date}
                      {v.kind === 'full_window' ? ` (${t('picker.fullWindow')})` : ''} · {t(`verdict.state.${v.state}`)}
                    </option>
                  ))}
                </select>
              </div>
            </Pliegue>

            {verdicts.status === 'loading' && <p>{t('picker.loading')}</p>}
            {verdicts.status === 'error' && <p role="alert">{t('picker.error')}</p>}
            {verdicts.status === 'ready' && items.length === 0 && <p>{t('picker.empty')}</p>}
            {verdicts.status === 'ready' && verdict && <VerdictCard verdict={verdict} />}
          </section>
        )}

        {mapOptions && mapVerdict && (
          <AtlasMap
            options={mapOptions}
            canCompare={vista === 'researcher' && hasOpticalScene(mapVerdict)}
            layerControls={!publica}
            busy={verdicts.status === 'loading' || mapVerdict !== verdict}
          />
        )}

        {aoi && (
          <Pliegue abierto={abiertos.event} onToggle={(a) => abrir('event', a)} resumen={t('event.fold')}>
            <EventQuery aoi={aoi} lang={lang} />
          </Pliegue>
        )}
      </main>

      <footer className="muted">
        <p>{t('footer.attribution')}</p>
        <p>{t('footer.license')}</p>
      </footer>
    </>
  )
}
