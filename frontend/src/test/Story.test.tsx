import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import { Story } from '../components/Story'
import i18n from '../i18n'
import { makeVerdict } from './fixtures'

const event = {
  aoi: 'parral',
  event_date: '2026-07-01',
  event_time: '21:37:00',
  event_type: 'urban_storm',
  persistence_hours: 6,
  assumption: { persistence_hours: 6, source: 'event_type', event_type: 'urban_storm', calibrated: false, hours_by_event_type: {}, text: 'Supuesto: 6 h.' },
  state: 'not_observable',
  cause: 'no_acquisition_during_event',
  cause_label: 'no hubo ninguna pasada mientras duraba el evento',
  previous_pass: '2026-06-29',
  next_pass: '2026-07-08',
  next_pass_acquired_at: null,
  data_kind: 'real',
  excluded_passes: [],
  summary: { detected: 'El evento del 2026-07-01 no es observable.', does_not_prove: 'n', missing: 'm' },
}

const pixel = {
  aoi: 'parral',
  series: 'T048A-F015',
  lon: -105.66631,
  lat: 26.93807,
  data_kind: 'synthetic',
  values: [],
  changes: [
    { pair: '20260617_20260629', state: 'no_change' },
    { pair: '20260629_20260711', state: 'change_probable' },
    { pair: '20260711_20260723', state: 'no_change' },
  ],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(fail: string[] = []) {
  const fetch = vi.fn(async (input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const p = url.pathname
    if (p.endsWith('/events')) return fail.includes('events') ? json({}, 500) : json(event)
    if (p.endsWith('/verdicts/20260816_20260828'))
      return json(makeVerdict({ id: '20260816_20260828', from_date: '2026-08-16', to_date: '2026-08-28' }))
    if (p.endsWith('/pixel')) return json(pixel)
    return json({ detail: 'Not Found' }, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

beforeEach(async () => {
  await i18n.changeLanguage('es')
})

afterEach(() => vi.unstubAllGlobals())

test('abre en la tormenta con su fuente y la respuesta en vivo', async () => {
  const fetch = stubApi()
  render(<Story aoi="parral" lang="es" onShowPair={() => {}} />)
  expect(screen.getByRole('button', { name: '1. La tormenta' })).toHaveAttribute('aria-current', 'step')
  expect(screen.getByRole('link', { name: /Protección Civil/ })).toHaveAttribute('href', expect.stringContaining('chihuahua.gob.mx'))
  expect(await screen.findByRole('heading', { name: /No observable/ })).toBeInTheDocument()
  const url = new URL((fetch.mock.calls[0][0] as Request).url)
  expect(url.searchParams.get('date')).toBe('2026-07-01')
  expect(url.searchParams.get('event_type')).toBe('urban_storm')
  expect(url.searchParams.get('time')).toBe('21:37')
})

test('se recorre con Siguiente y Anterior, y la escena de agosto lleva su par al mapa', async () => {
  const user = userEvent.setup()
  stubApi()
  const onShowPair = vi.fn()
  render(<Story aoi="parral" lang="es" onShowPair={onShowPair} />)

  expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
  expect(screen.getByRole('button', { name: '2. Agosto' })).toHaveAttribute('aria-current', 'step')
  expect(await screen.findByText('del 2026-08-16 al 2026-08-28 · 12 días')).toBeInTheDocument()

  // Sin la lluvia como contexto: sugeriría una causa que solo es hipótesis (revisión de Balanza, PR 57).
  expect(document.querySelector('.story')!.textContent).not.toMatch(/lluvia|monzón/i)

  await user.click(screen.getByRole('button', { name: 'Ver este par en el mapa' }))
  expect(onShowPair).toHaveBeenCalledWith('T048A-F015', '20260816_20260828')

  await user.click(screen.getByRole('button', { name: 'Anterior' }))
  expect(screen.getByRole('button', { name: '1. La tormenta' })).toHaveAttribute('aria-current', 'step')
})

test('la mina cuenta en vivo los pares sin cambio, sin llamarlo jales, y avisa si es sintético', async () => {
  const user = userEvent.setup()
  stubApi()
  render(<Story aoi="parral" lang="es" onShowPair={() => {}} />)
  await user.click(screen.getByRole('button', { name: '3. La mina' }))

  expect(await screen.findByText('2 de 3 pares sin cambio detectable en este punto.')).toBeInTheDocument()
  expect(screen.getByText('Este veredicto usa datos sintéticos.')).toBeInTheDocument()
  expect(screen.getByText(/2026-06-29 → 2026-07-11/)).toHaveTextContent('Cambio probable')
  expect(document.body.textContent).not.toMatch(/jales/i)
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
})

test('si una escena falla, lo avisa y las demás siguen funcionando', async () => {
  const user = userEvent.setup()
  stubApi(['events'])
  render(<Story aoi="parral" lang="es" onShowPair={() => {}} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar esta escena')
  await user.click(screen.getByRole('button', { name: '3. La mina' }))
  expect(await screen.findByText(/pares sin cambio detectable/)).toBeInTheDocument()
})

test('en inglés vuelve a pedir la escena con lang=en', async () => {
  const fetch = stubApi()
  await i18n.changeLanguage('en')
  render(<Story aoi="parral" lang="en" onShowPair={() => {}} />)
  expect(await screen.findByRole('heading', { name: '1. The storm of 1 July 2026' })).toBeInTheDocument()
  await screen.findByRole('heading', { name: /Not observable/ })
  expect(new URL((fetch.mock.calls[0][0] as Request).url).searchParams.get('lang')).toBe('en')
})
