// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'

const contract = new URL('../../../contracts/verdicts.openapi.json', import.meta.url)
const generated = fileURLToPath(new URL('../api/verdicts.d.ts', import.meta.url))

test('los tipos coinciden con contracts/verdicts.openapi.json (si falla: npm run gen:types)', async () => {
  const fresh = astToString(await openapiTS(contract))
  const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '').trim()
  expect(normalize(readFileSync(generated, 'utf8'))).toBe(normalize(fresh))
})
