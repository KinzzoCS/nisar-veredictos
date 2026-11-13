import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictsApi, type Lang, type SeriesInfo, type Verdict } from './api/client'
import { LanguageSwitch } from './components/LanguageSwitch'
import { MapSlot } from './components/MapSlot'
import { SyntheticBanner } from './components/SyntheticBadge'
import { VerdictCard } from './components/VerdictCard'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; aoi: string; series: SeriesInfo[] }

type Verdicts =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: Verdict[] }

/** Respuesta guardada con la petición (serie e idioma) a la que corresponde. */
type Loaded = Exclude<Verdicts, { status: 'loading' }> & { key: string }

async function loadSeries(): Promise<Load> {
  const aois = await verdictsApi.GET('/aois')
  const aoi = aois.data?.[0]
  if (!aoi) return { status: 'error' }
  const series = await verdictsApi.GET('/aois/{aoi}/series', { params: { path: { aoi } } })
  return series.data ? { status: 'ready', aoi, series: series.data } : { status: 'error' }
}

function asBbox(bbox: number[]): [number, number, number, number] | null {
  return bbox.length === 4 ? [bbox[0], bbox[1], bbox[2], bbox[3]] : null
}

/** Primer par consecutivo; si no hay, el primero que llegue. */
function defaultPair(items: Verdict[]): string | undefined {
  return (items.find((v) => v.kind === 'consecutive') ?? items[0])?.id
}

export default function App() {
  const { t, i18n } = useTranslation()
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
        if (!data) return setLoaded({ key, status: 'error' })
        setLoaded({ key, status: 'ready', items: data })
        setPairId((prev) => (prev && data.some((v) => v.id === prev) ? prev : defaultPair(data)))
      })
      .catch(() => current && setLoaded({ key, status: 'error' }))
    return () => {
      current = false
    }
  }, [aoi, seriesId, lang])

  const series = state.status === 'ready' ? state.series.find((s) => s.id === seriesId) : undefined
  const bbox = series ? asBbox(series.bbox) : null
  const items = verdicts.status === 'ready' ? verdicts.items : []
  const verdict = items.find((v) => v.id === pairId)
  const synthetic = series?.data_kind === 'synthetic' || verdict?.receipt.data_kind === 'synthetic'

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <LanguageSwitch />
      </header>
      {synthetic && <SyntheticBanner />}

      <main>
        {state.status === 'loading' && <p>{t('series.loading')}</p>}
        {state.status === 'error' && <p role="alert">{t('series.error')}</p>}

        {state.status === 'ready' && (
          <section aria-labelledby="picker-heading" aria-busy={verdicts.status === 'loading'}>
            <h2 id="picker-heading">{t('picker.heading')}</h2>
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

            {verdicts.status === 'loading' && <p>{t('picker.loading')}</p>}
            {verdicts.status === 'error' && <p role="alert">{t('picker.error')}</p>}
            {verdicts.status === 'ready' && items.length === 0 && <p>{t('picker.empty')}</p>}
            {verdicts.status === 'ready' && verdict && <VerdictCard verdict={verdict} />}
          </section>
        )}

        {series && bbox && (
          <MapSlot
            aoi={bbox}
            layers={{ state: '', change_hh: '', change_hv: '' }}
            activeLayer="state"
            compare="off"
            dataKind={series.data_kind}
          />
        )}
      </main>

      <footer className="muted">
        <p>{t('footer.attribution')}</p>
        <p>{t('footer.license')}</p>
      </footer>
    </>
  )
}
