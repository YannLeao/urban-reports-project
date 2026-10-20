import { expect, test } from 'vitest'
import { administrativeReturn, changeFilters, filterQuery, parseFilters } from './filters'
import { queryMap } from './map-navigation'
import { validPrivatePath } from '../../lib/api'

test('normalizes filters by context, duplicates, forbidden states and canonical numeric ids', () => {
  expect(parseFilters(new URLSearchParams('categoria=02&estado=IN_ANALYSIS&pagina=3&visao=mapa'), 'public')).toMatchObject({ filters: { categoryId: 2, status: 'IN_ANALYSIS' }, invalid: false })
  for (const raw of ['categoria=0', 'categoria=9', 'categoria=1&categoria=2', 'estado=', 'estado=pending', 'estado=REJECTED', 'escopo=todos'])
    expect(parseFilters(new URLSearchParams(raw), 'public').invalid).toBe(true)
  expect(parseFilters(new URLSearchParams('estado=REJECTED'), 'own').filters.status).toBe('REJECTED')
  expect(parseFilters(new URLSearchParams('estado=RESOLVED'), 'admin').invalid).toBe(true)
  expect(parseFilters(new URLSearchParams('escopo=todos&estado=REJECTED'), 'admin').filters).toMatchObject({ scope: 'ALL', status: 'REJECTED' })
})
test('atomic criteria changes clear page and pin, preserve view/viewport and administrative scope', () => {
  const params = new URLSearchParams('categoria=2&estado=REJECTED&escopo=todos&pagina=4&visao=mapa&lat=0&lng=0&zoom=12&selecionado=old')
  const queue = changeFilters(params, { scope: 'QUEUE' }, 'admin')
  expect(queue.toString()).toBe('visao=mapa&lat=0&lng=0&zoom=12&categoria=2')
  const clear = changeFilters(params, { categoryId: null, status: null }, 'admin')
  expect(clear.get('escopo')).toBe('todos'); expect(clear.has('pagina')).toBe(false)
  expect(filterQuery(parseFilters(params, 'admin').filters, true)).toBe('categoryId=2&status=REJECTED&scope=ALL')
})
test('admin return requires exact local path and strict allowed parameters', () => {
  expect(administrativeReturn('/administracao/relatos?categoria=2&estado=RESOLVED&escopo=todos&pagina=3')).toContain('escopo=todos')
  for (const raw of ['https://evil.example/administracao/relatos', '//evil.example', '/administracao/relatos-extra?pagina=1', '/administracao/relatos?from=https://evil.example', '/administracao/relatos?pagina=1&pagina=2', '/administracao/relatos?estado=REJECTED', '/administracao/relatos?pagina=2#bad']) expect(administrativeReturn(raw)).toBe('/administracao/relatos')
})
test('private allowlist restricts filters and scope to their endpoints without arbitrary query paths', () => {
  for (const raw of ['/api/occurrences?categoryId=2&status=REJECTED', '/api/occurrences/markers?status=PENDING', '/api/admin/occurrences?page=0&size=20&scope=ALL&categoryId=2&status=RESOLVED', '/api/super-admin/admins?page=0&size=20']) expect(validPrivatePath(raw)).toBe(true)
  for (const raw of ['/api/occurrences?authorId=123', '/api/occurrences?scope=ALL', '/api/occurrences/markers?page=0', '/api/auth/me?categoryId=2', '/api/admin/occurrences?scope=SQL', '/api/occurrences?status=', '/api/occurrences?status=PENDING&status=RESOLVED', '/api/occurrences?categoryId=1%26authorId=2', '//evil.example/api/occurrences', '/api/occurrences?status=PENDING?size=1']) expect(validPrivatePath(raw)).toBe(false)
})

test('detail map links preserve origin filters/page/viewport and use direct-access fallback', () => {
  expect(queryMap('/ocorrencias?pagina=2&categoria=1&estado=PENDING&lat=0&lng=0&zoom=12', false))
    .toBe('/ocorrencias?pagina=2&categoria=1&estado=PENDING&lat=0&lng=0&zoom=12&visao=mapa')
  expect(queryMap('/meus-relatos?categoria=2&estado=REJECTED', true)).toBe('/meus-relatos?categoria=2&estado=REJECTED&visao=mapa')
  expect(queryMap(undefined, true)).toBe('/meus-relatos?visao=mapa')
})
