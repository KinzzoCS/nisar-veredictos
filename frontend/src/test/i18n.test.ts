import en from '../i18n/en.json'
import es from '../i18n/es.json'

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

test('español e inglés tienen exactamente las mismas claves', () => {
  expect(keys(en).sort()).toEqual(keys(es).sort())
})

test('ningún texto está vacío', () => {
  for (const dict of [es, en]) {
    for (const key of keys(dict)) {
      const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict)
      expect(value, key).not.toBe('')
    }
  }
})
