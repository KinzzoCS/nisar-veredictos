import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictsApi, type SeriesInfo } from './api/client'
import { LanguageSwitch } from './components/LanguageSwitch'
import { MapSlot } from './components/MapSlot'

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; aoi: string; series: SeriesInfo[] }

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

export default function App() {
  const { t } = useTranslation()
  const [state, setState] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    loadSeries()
      .then(setState)
      .catch(() => setState({ status: 'error' }))
  }, [])

  const first = state.status === 'ready' ? state.series[0] : undefined
  const bbox = first ? asBbox(first.bbox) : null

  return (
    <>
      <header className="app-header">
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <LanguageSwitch />
      </header>

      <main>
        <section aria-labelledby="series-heading" aria-busy={state.status === 'loading'}>
          <h2 id="series-heading">{t('series.heading')}</h2>
          {state.status === 'loading' && <p>{t('series.loading')}</p>}
          {state.status === 'error' && <p role="alert">{t('series.error')}</p>}
          {state.status === 'ready' && (
            <ul className="series-list">
              {state.series.map((s) => (
                <li key={s.id}>
                  <strong>{s.id}</strong>
                  {' · '}
                  {t('series.dates', { count: s.dates.length })}
                  {s.dates.length > 0 && (
                    <> {t('series.range', { from: s.dates[0], to: s.dates[s.dates.length - 1] })}</>
                  )}
                  <br />
                  <span className="muted">
                    {t('series.dataKind')}: {t(`dataKind.${s.data_kind}`)} · {t('series.maturity')}: {s.maturity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {first && bbox && (
          <MapSlot
            aoi={bbox}
            layers={{ state: '', change_hh: '', change_hv: '' }}
            activeLayer="state"
            compare="off"
            dataKind={first.data_kind}
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
