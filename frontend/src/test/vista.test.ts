import { afterEach, vi } from 'vitest'
import { temaGuardado } from '../tema/tema'
import { vistaGuardada } from '../vista/vista'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

test('sin almacenamiento la vista vuelve a Público y el tema al del sistema, sin errores', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denegado', 'SecurityError')
  })
  expect(vistaGuardada()).toBe('public')
  expect(temaGuardado()).toBe('sistema')
})

test('un valor guardado que no es una vista se ignora', () => {
  localStorage.setItem('vista', 'admin')
  expect(vistaGuardada()).toBe('public')
  localStorage.setItem('vista', 'researcher')
  expect(vistaGuardada()).toBe('researcher')
})
