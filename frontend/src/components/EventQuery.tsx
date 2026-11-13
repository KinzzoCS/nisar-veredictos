import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { verdictsApi, type EventVerdict, type Lang } from '../api/client'
import { EVENT_TYPES, EXAMPLE, type Query } from '../story/data'
import { SyntheticNotice } from './SyntheticBadge'

type Result =
  | { key: string; status: 'error' }
  | { key: string; status: 'ready'; event: EventVerdict }

function keyOf(q: Query, lang: Lang) {
  return `${q.date}|${q.eventType}|${q.time}|${lang}`
}

export function EventAnswer({
  event,
  headingRef,
  headingId = 'event-answer-heading',
}: {
  event: EventVerdict
  headingRef?: Ref<HTMLHeadingElement>
  headingId?: string
}) {
  const { t } = useTranslation()
  const observable = event.state === 'observable'
  return (
    <article className={`verdict-card event-${event.state}`} aria-labelledby={headingId}>
      {event.data_kind === 'synthetic' && <SyntheticNotice />}
      <header className="verdict-head">
        <h3 id={headingId} className="verdict-state" tabIndex={-1} ref={headingRef}>
          <span className="verdict-icon" aria-hidden="true">
            {observable ? '◉' : '⊘'}
          </span>{' '}
          {t(`event.state.${event.state}`)}
        </h3>
        {!observable && event.cause_label && (
          <p className="verdict-cause">{t('event.cause', { cause: event.cause_label })}</p>
        )}
        {observable && <p className="verdict-cause">{t('event.observableNote')}</p>}
      </header>

      <dl className="verdict-summary">
        <div>
          <dt>{t('event.detected')}</dt>
          <dd>{event.summary.detected}</dd>
        </div>
        <div>
          <dt>{t('verdict.doesNotProve')}</dt>
          <dd>{event.summary.does_not_prove}</dd>
        </div>
        <div>
          <dt>{t('verdict.missing')}</dt>
          <dd>{event.summary.missing}</dd>
        </div>
      </dl>

      <dl className="event-facts">
        <dt>{t('event.previousPass')}</dt>
        <dd>{event.previous_pass ?? t('event.none')}</dd>
        <dt>{t('event.nextPass')}</dt>
        <dd>{event.next_pass ?? t('event.none')}</dd>
        <dt>{t('event.assumption')}</dt>
        <dd>{event.assumption.text}</dd>
        {event.excluded_passes.length > 0 && (
          <>
            <dt>{t('event.excluded')}</dt>
            <dd>
              <ul>
                {event.excluded_passes.map((p) => (
                  <li key={p.granule}>
                    {p.date} ({p.series}): {p.reason}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </article>
  )
}

/**
 * Consulta de evento (RF-FAR-02): ¿pasó el satélite mientras duraba el evento?
 * Los textos llegan de la API; aquí solo hay rótulos.
 */
export function EventQuery({ aoi, lang }: { aoi: string; lang: Lang }) {
  const { t } = useTranslation()
  const ids = { date: useId(), type: useId(), time: useId(), timeHelp: useId() }
  const [form, setForm] = useState<Query>({ date: '', eventType: '', time: '' })
  const [query, setQuery] = useState<Query>()
  const [result, setResult] = useState<Result>()
  const heading = useRef<HTMLHeadingElement>(null)
  const focusOnArrival = useRef(false)

  const requestKey = query ? keyOf(query, lang) : undefined

  // Se repite al cambiar de idioma: los textos llegan de la API con `lang`.
  useEffect(() => {
    if (!query) return
    let current = true
    const key = keyOf(query, lang)
    verdictsApi
      .GET('/aois/{aoi}/events', {
        params: {
          path: { aoi },
          query: {
            date: query.date,
            lang,
            ...(query.eventType ? { event_type: query.eventType } : {}),
            ...(query.time ? { time: query.time } : {}),
          },
        },
      })
      .then(({ data }) => {
        if (!current) return
        setResult(data ? { key, status: 'ready', event: data } : { key, status: 'error' })
      })
      .catch(() => current && setResult({ key, status: 'error' }))
    return () => {
      current = false
    }
  }, [aoi, query, lang])

  const shown = result && result.key === requestKey ? result : undefined
  const loading = query !== undefined && !shown

  useEffect(() => {
    if (shown?.status === 'ready' && focusOnArrival.current) {
      focusOnArrival.current = false
      heading.current?.focus()
    }
  }, [shown])

  function ask(q: Query) {
    focusOnArrival.current = true
    setQuery({ ...q })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.date) ask(form)
  }

  return (
    <section className="event-query" aria-labelledby="event-heading" aria-busy={loading}>
      <h2 id="event-heading">{t('event.heading')}</h2>
      <p className="muted">{t('event.intro')}</p>

      <form className="picker" onSubmit={onSubmit}>
        <label htmlFor={ids.date}>{t('event.date')}</label>
        <input
          id={ids.date}
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />

        <label htmlFor={ids.type}>{t('event.type')}</label>
        <select
          id={ids.type}
          value={form.eventType}
          onChange={(e) => setForm({ ...form, eventType: e.target.value as Query['eventType'] })}
        >
          <option value="">{t('event.types.none')}</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`event.types.${type}`)}
            </option>
          ))}
        </select>

        <label htmlFor={ids.time}>{t('event.time')}</label>
        <div>
          <input
            id={ids.time}
            type="time"
            value={form.time}
            aria-describedby={ids.timeHelp}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />
          <p id={ids.timeHelp} className="muted field-help">
            {t('event.timeHelp')}
          </p>
        </div>

        <div className="form-actions">
          <button type="submit">{t('event.submit')}</button>
          <button
            type="button"
            onClick={() => {
              setForm(EXAMPLE)
              ask(EXAMPLE)
            }}
          >
            {t('event.example')}
          </button>
        </div>
      </form>

      {loading && <p>{t('event.loading')}</p>}
      {shown?.status === 'error' && <p role="alert">{t('event.error')}</p>}
      {shown?.status === 'ready' && <EventAnswer event={shown.event} headingRef={heading} />}
    </section>
  )
}
