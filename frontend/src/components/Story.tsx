import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictsApi, type Lang, type PixelSeries } from '../api/client'
import { useLive, type Live } from '../api/useLive'
import { etiquetaEstado, fechasDelPar } from '../mapa/seleccion'
import { STORY } from '../story/data'
import { EventAnswer } from './EventQuery'
import { SyntheticNotice } from './SyntheticBadge'
import { VerdictCard } from './VerdictCard'

/** Boletín de Protección Civil de Chihuahua, verificado en MEMORY.md (Caso de Parral). */
const STORM_SOURCE =
  'https://www.chihuahua.gob.mx/index.php/prensa/registra-parral-228-milimetros-de-lluvia-en-el-lapso-de-una-hora'

const SCENES = ['storm', 'monsoon', 'mine'] as const
type Scene = (typeof SCENES)[number]

function Status<T>({ live, children }: { live: Live<T>; children: (data: T) => ReactNode }) {
  const { t } = useTranslation()
  if (live.status === 'loading') return <p>{t('story.loading')}</p>
  if (live.status === 'error') return <p role="alert">{t('story.error')}</p>
  return <>{children(live.data)}</>
}

function StormScene({ aoi, lang }: { aoi: string; lang: Lang }) {
  const { t } = useTranslation()
  const s = STORY.storm
  const live = useLive(`storm|${aoi}|${lang}`, async () => {
    const { data } = await verdictsApi.GET('/aois/{aoi}/events', {
      params: { path: { aoi }, query: { date: s.date, event_type: s.eventType || undefined, time: s.time, lang } },
    })
    return data
  })
  return (
    <>
      <p>{t('story.storm.text')}</p>
      <p className="muted">
        <a href={STORM_SOURCE} target="_blank" rel="noreferrer">
          {t('story.storm.source')}
        </a>
      </p>
      <Status live={live}>{(event) => <EventAnswer event={event} headingId="story-storm-answer" />}</Status>
    </>
  )
}

function MonsoonScene({
  aoi,
  lang,
  onShowPair,
}: {
  aoi: string
  lang: Lang
  onShowPair: (series: string, pair: string) => void
}) {
  const { t } = useTranslation()
  const { series, pair } = STORY.monsoon
  const live = useLive(`monsoon|${aoi}|${lang}`, async () => {
    const { data } = await verdictsApi.GET('/aois/{aoi}/series/{series_id}/verdicts/{pair_id}', {
      params: { path: { aoi, series_id: series, pair_id: pair }, query: { lang } },
    })
    return data
  })
  return (
    <>
      <p>{t('story.monsoon.text')}</p>
      <Status live={live}>
        {(verdict) => (
          <>
            <VerdictCard verdict={verdict} />
            <button type="button" className="story-map-link" onClick={() => onShowPair(series, pair)}>
              {t('story.monsoon.showOnMap')}
            </button>
          </>
        )}
      </Status>
    </>
  )
}

function isNoChange(state: string | null) {
  return state === 'no_change' || state === 'no_detectable_change'
}

function MineScene({ aoi, lang }: { aoi: string; lang: Lang }) {
  const { t, i18n } = useTranslation()
  const { series, lon, lat } = STORY.mine
  const live = useLive<PixelSeries>(`mine|${aoi}`, async () => {
    const { data } = await verdictsApi.GET('/aois/{aoi}/series/{series_id}/pixel', {
      params: { path: { aoi, series_id: series }, query: { lon, lat } },
    })
    return data
  })
  const fmt = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
  return (
    <>
      <p>{t('story.mine.text')}</p>
      <p className="muted">{t('story.mine.point', { lon: fmt.format(lon), lat: fmt.format(lat), series })}</p>
      <Status live={live}>
        {(pixel) => (
          <div className="story-pixel">
            {pixel.data_kind === 'synthetic' && <SyntheticNotice />}
            <p className="story-count">
              {t('story.mine.count', {
                same: pixel.changes.filter((c) => isNoChange(c.state)).length,
                total: pixel.changes.length,
              })}
            </p>
            <p>{t('story.mine.note')}</p>
            <h4>{t('story.mine.pairs')}</h4>
            <ul>
              {pixel.changes.map((c) => {
                const dates = fechasDelPar(c.pair)
                return (
                  <li key={c.pair}>
                    {dates ? `${dates[0]} → ${dates[1]}` : c.pair}: {etiquetaEstado(c.state, lang)}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Status>
    </>
  )
}

/**
 * Modo historia de Parral (RF-FAR-04): tres escenas, una cada vez, con datos en vivo.
 * Los textos de Faro presentan la escena; el resultado lo dice siempre la API.
 */
export function Story({
  aoi,
  lang,
  onShowPair,
}: {
  aoi: string
  lang: Lang
  onShowPair: (series: string, pair: string) => void
}) {
  const { t } = useTranslation()
  const [scene, setScene] = useState<Scene>('storm')
  const index = SCENES.indexOf(scene)

  return (
    <section className="story" aria-labelledby="story-heading">
      <h2 id="story-heading">{t('story.heading')}</h2>
      <p className="muted">{t('story.intro')}</p>

      <nav aria-label={t('story.nav')}>
        <ol className="story-steps">
          {SCENES.map((s, i) => (
            <li key={s}>
              <button type="button" aria-current={s === scene ? 'step' : undefined} onClick={() => setScene(s)}>
                {i + 1}. {t(`story.${s}.step`)}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="story-scene">
        <h3>{t(`story.${scene}.title`)}</h3>
        {scene === 'storm' && <StormScene aoi={aoi} lang={lang} />}
        {scene === 'monsoon' && <MonsoonScene aoi={aoi} lang={lang} onShowPair={onShowPair} />}
        {scene === 'mine' && <MineScene aoi={aoi} lang={lang} />}
      </div>

      <div className="story-pager">
        <button type="button" disabled={index === 0} onClick={() => setScene(SCENES[index - 1])}>
          {t('story.prev')}
        </button>
        <span className="muted">{t('story.position', { n: index + 1, total: SCENES.length })}</span>
        <button type="button" disabled={index === SCENES.length - 1} onClick={() => setScene(SCENES[index + 1])}>
          {t('story.next')}
        </button>
      </div>
    </section>
  )
}
