import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { SeriesInfo, Verdict } from '../api/client'
import { ESTADOS, claveVeredicto, type Filtro } from '../comunidad/historias'
import { Esqueleto } from './Esqueleto'
import { Marca } from './Marca'

const DIA = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)

/**
 * Línea de tiempo del buscador: una fila por serie con sus pasadas y el rango elegido encima.
 * Es un resumen visual; el rango se cambia con los campos de fecha, que dicen lo mismo en texto.
 */
function LineaRango({ series, filtro }: { series: SeriesInfo[]; filtro: Filtro }) {
  const fechas = series.flatMap((s) => s.dates).sort()
  if (fechas.length === 0) return null
  const ini = ms(fechas[0])
  const fin = ms(fechas.at(-1)!)
  const ancho = 280
  const x = (d: string) => 8 + ((ms(d) - ini) / Math.max(fin - ini, DIA)) * (ancho - 16)
  const fila = 22
  const alto = series.length * fila + 18
  const desde = filtro.desde || fechas[0]
  const hasta = filtro.hasta || fechas.at(-1)!
  return (
    <svg className="linea-rango" viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      <rect className="linea-rango-sel" x={x(desde)} y={2} width={Math.max(x(hasta) - x(desde), 2)} height={alto - 16} />
      {series.map((s, i) => {
        const y = 4 + i * fila
        const activa = filtro.series === 'all' || filtro.series === s.id
        return (
          <g key={s.id} opacity={activa ? 1 : 0.35}>
            <text x={8} y={y + 8} fontSize="9" fill="currentColor">
              {s.id}
            </text>
            {s.dates.map((d) => (
              <line key={d} x1={x(d)} x2={x(d)} y1={y + 10} y2={y + 19} stroke="currentColor" strokeWidth="2" />
            ))}
          </g>
        )
      })}
      <text x={8} y={alto - 2} fontSize="9" fill="currentColor">
        {new Date(ini).toISOString().slice(0, 7)}
      </text>
      <text x={ancho - 8} y={alto - 2} fontSize="9" fill="currentColor" textAnchor="end">
        {new Date(fin).toISOString().slice(0, 7)}
      </text>
    </svg>
  )
}

export function Buscador({
  series,
  filtro,
  onFiltro,
  resultados,
  seleccion,
  onSeleccionar,
  cargando,
  error,
  plegarAvanzado,
}: {
  series: SeriesInfo[]
  filtro: Filtro
  onFiltro: (f: Filtro) => void
  resultados: Verdict[]
  seleccion: string | undefined
  onSeleccionar: (v: Verdict) => void
  cargando: boolean
  error: boolean
  /** En vista Público, estados y ventanas van plegados (RF-INT-03). */
  plegarAvanzado: boolean
}) {
  const { t } = useTranslation()
  const ids = { serie: useId(), desde: useId(), hasta: useId(), titulo: useId() }
  const todas = series.flatMap((s) => s.dates).sort()
  const min = todas[0]
  const max = todas.at(-1)
  const cambiar = (parcial: Partial<Filtro>) => onFiltro({ ...filtro, ...parcial })

  const avanzado = (
    <>
      <fieldset className="buscador-estados">
        <legend>{t('search.states')}</legend>
        {ESTADOS.map((e) => (
          <label key={e} className="casilla">
            <input
              type="checkbox"
              checked={filtro.estados.includes(e)}
              onChange={(ev) =>
                cambiar({ estados: ev.target.checked ? [...filtro.estados, e] : filtro.estados.filter((x) => x !== e) })
              }
            />
            <Marca estado={e} />
            {t(`verdict.state.${e}`)}
          </label>
        ))}
      </fieldset>
      <label className="casilla">
        <input type="checkbox" checked={filtro.ventanas} onChange={(ev) => cambiar({ ventanas: ev.target.checked })} />
        {t('search.fullWindows')}
      </label>
    </>
  )

  return (
    <section className="buscador" aria-labelledby={ids.titulo}>
      <h2 id={ids.titulo} className="panel-titulo">
        {t('search.heading')}
      </h2>
      <div className="campo">
        <label htmlFor={ids.serie}>{t('picker.series')}</label>
        <select id={ids.serie} value={filtro.series} onChange={(e) => cambiar({ series: e.target.value })}>
          <option value="all">{t('search.allSeries')}</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {t(`dataKind.${s.data_kind}`)}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="buscador-rango">
        <legend>{t('search.timeline')}</legend>
        <LineaRango series={series} filtro={filtro} />
        <div className="rango-campos">
          <div className="campo">
            <label htmlFor={ids.desde}>{t('search.from')}</label>
            <input
              id={ids.desde}
              type="date"
              min={min}
              max={filtro.hasta || max}
              value={filtro.desde}
              onChange={(e) => cambiar({ desde: e.target.value })}
            />
          </div>
          <div className="campo">
            <label htmlFor={ids.hasta}>{t('search.to')}</label>
            <input
              id={ids.hasta}
              type="date"
              min={filtro.desde || min}
              max={max}
              value={filtro.hasta}
              onChange={(e) => cambiar({ hasta: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      {plegarAvanzado ? (
        <details className="pliegue">
          <summary>{t('search.more')}</summary>
          {avanzado}
        </details>
      ) : (
        avanzado
      )}

      <div className="resultados" aria-busy={cargando}>
        <h3 className="resultados-titulo" aria-live="polite">
          {t('search.results', { count: resultados.length })}
        </h3>
        {cargando && <Esqueleto etiqueta={t('picker.loading')} variante="lista" filas={6} />}
        {error && <p role="alert">{t('picker.error')}</p>}
        <ol className="resultados-lista">
          {resultados.map((v) => {
            const clave = claveVeredicto(v)
            return (
              <li key={clave}>
                <button type="button" aria-pressed={seleccion === clave} onClick={() => onSeleccionar(v)}>
                  <Marca estado={v.state} />
                  <span className="resultado-texto">
                    <span className="resultado-fechas">
                      {v.from_date} → {v.to_date}
                    </span>
                    <span className="resultado-meta">
                      {v.series}
                      {v.kind === 'full_window' ? ` · ${t('picker.fullWindow')}` : ''} · {t(`verdict.state.${v.state}`)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
