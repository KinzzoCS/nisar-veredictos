import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { API_BASE } from '../api/client'
import type { components } from '../mapa/catalogo'
import type { Bbox } from '../mapa/tipos'
import { Esqueleto } from './Esqueleto'
import { Icono } from './Iconos'

export type GranuloMundo = components['schemas']['WorldGranuleOut']
type Respuesta = components['schemas']['WorldSearchOut']

const DIA = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/** La vista del mapa como caja válida para CMR: dentro de ±180/±90 y sin cruzar el antimeridiano. */
function cajaBuscable(b: Bbox | null): Bbox {
  if (!b) return [-180, -90, 180, 90]
  const [o, s, e, n] = b
  const sur = Math.max(-90, s)
  const norte = Math.min(90, n)
  if (e - o >= 360 || o < -180 || e > 180 || o >= e) return [-180, sur, 180, norte]
  return [o, sur, e, norte]
}

const fmt = (x: number) => x.toFixed(2)

/**
 * Buscador mundial (2026-11-14): pasadas NISAR GCOV en la parte del mundo que se ve en el mapa, sin descargar
 * nada y sin cuenta. Usa dos recursos oficiales del reto: CMR (el catálogo de NASA Earthdata Search) y las vistas
 * previas públicas de ASF (Vertex). Al elegir una pasada, el mapa vuela a ella y pinta su huella y su vista previa.
 */
export function Mundo({
  vista,
  onResultados,
  elegido,
  onElegir,
}: {
  /** Lo que se ve del mapa ahora, [oeste, sur, este, norte]. */
  vista: Bbox | null
  onResultados: (g: GranuloMundo[]) => void
  elegido: string | null
  onElegir: (g: GranuloMundo) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'es'
  const ids = { desde: useId(), hasta: useId(), titulo: useId() }
  const [hoy] = useState(() => iso(Date.now()))
  const [desde, setDesde] = useState(() => iso(Date.now() - 90 * DIA))
  const [hasta, setHasta] = useState(hoy)
  const [direccion, setDireccion] = useState<'' | 'A' | 'D'>('')
  const [estado, setEstado] = useState<
    { tipo: 'nada' } | { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'listo'; datos: Respuesta }
  >({ tipo: 'nada' })

  async function buscar(e?: FormEvent) {
    e?.preventDefault()
    const caja = cajaBuscable(vista)
    const q = new URLSearchParams({ bbox: caja.map((v) => v.toFixed(4)).join(','), from: desde, to: hasta, limit: '60' })
    if (direccion) q.set('direction', direccion)
    setEstado({ tipo: 'cargando' })
    try {
      // Sin respuesta en 30 s se avisa en vez de quedarse cargando: con el mapa pidiendo muchas teselas al mismo
      // servidor, el navegador puede encolar la búsqueda (prueba de uso del 2026-11-14).
      const r = await fetch(`${API_BASE}/api/catalog/search/world?${q}`, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new Error(String(r.status))
      const datos = (await r.json()) as Respuesta
      setEstado({ tipo: 'listo', datos })
      onResultados(datos.granules)
    } catch {
      setEstado({ tipo: 'error' })
      onResultados([])
    }
  }

  const fecha = (d: string) =>
    new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(
      new Date(d),
    )
  const caja = cajaBuscable(vista)

  return (
    <section className="mundo" aria-labelledby={ids.titulo}>
      <h2 id={ids.titulo}>{t('world.heading')}</h2>
      <p className="muted">{t('world.intro')}</p>

      <form className="mundo-formulario" onSubmit={buscar}>
        <p className="mundo-vista">
          <Icono nombre="mapa" tamano={16} />
          <span>
            {t('world.area')}{' '}
            <span className="mundo-caja">
              {vista && caja[2] - caja[0] < 360
                ? `${fmt(caja[0])}°, ${fmt(caja[1])}° → ${fmt(caja[2])}°, ${fmt(caja[3])}°`
                : t('world.wholeWorld')}
            </span>
          </span>
        </p>
        <p className="paso-ayuda">{t('world.areaHelp')}</p>
        <div className="rango-campos">
          <div className="campo">
            <label htmlFor={ids.desde}>{t('search.from')}</label>
            <input id={ids.desde} type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor={ids.hasta}>{t('search.to')}</label>
            <input id={ids.hasta} type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} required />
          </div>
        </div>
        <fieldset className="chips mundo-direccion">
          <legend className="sr-solo">{t('world.direction')}</legend>
          {(['', 'A', 'D'] as const).map((d) => (
            <label key={d || 'todas'} className="chip">
              <input type="radio" name={`${ids.titulo}-dir`} checked={direccion === d} onChange={() => setDireccion(d)} />
              <span>{d ? t(`search.direction.${d}`) : t('world.bothDirections')}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="boton-principal boton-con-texto" disabled={estado.tipo === 'cargando'}>
          <Icono nombre="buscar" tamano={16} />
          {t('world.search')}
        </button>
      </form>

      <div aria-live="polite" aria-busy={estado.tipo === 'cargando'}>
        {estado.tipo === 'cargando' && <Esqueleto etiqueta={t('world.loading')} variante="lista" filas={4} />}
        {estado.tipo === 'error' && <p role="alert">{t('world.error')}</p>}
        {estado.tipo === 'listo' && (
          <>
            <h3 className="resultados-titulo">
              {t('world.results', { count: estado.datos.granules.length, total: estado.datos.total })}
            </h3>
            {estado.datos.granules.length === 0 && <p className="resultados-vacio">{t('world.none')}</p>}
            <ol className="mundo-lista">
              {estado.datos.granules.map((g) => (
                <li key={g.id} data-elegido={elegido === g.id}>
                  <button type="button" className="mundo-tarjeta" aria-pressed={elegido === g.id} onClick={() => onElegir(g)}>
                    {g.thumbnail_url ? (
                      <img src={g.thumbnail_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="mundo-sin-imagen" aria-hidden="true">
                        <Icono nombre="satelite" tamano={20} />
                      </span>
                    )}
                    <span className="mundo-texto">
                      <strong>{fecha(g.acquired_at)} UTC</strong>
                      <span>
                        T{String(g.track).padStart(3, '0')} · {t('world.frame')} {g.frame} · {t(`search.direction.${g.direction}`)}
                      </span>
                      <span className="muted">
                        {g.polarization} · {(g.size_mb / 1024).toFixed(1)} GB
                      </span>
                    </span>
                  </button>
                  <div className="mundo-enlaces">
                    <a href={g.vertex_url} target="_blank" rel="noopener noreferrer">
                      ASF Vertex
                      <span className="sr-solo"> ({t('world.newTab')})</span>
                    </a>
                    <a href={g.earthdata_search_url} target="_blank" rel="noopener noreferrer">
                      Earthdata Search
                      <span className="sr-solo"> ({t('world.newTab')})</span>
                    </a>
                  </div>
                </li>
              ))}
            </ol>
            <p className="aviso-sesion muted">{t('world.note')}</p>
            <p className="muted mundo-fuentes">{t('world.sources')}</p>
          </>
        )}
      </div>
    </section>
  )
}
