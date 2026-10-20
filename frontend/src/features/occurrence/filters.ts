import { occurrenceStatusSchema, type Occurrence } from './occurrence'
import { categoryIdSchema } from './category'

export type FilterContext = 'public' | 'own' | 'admin'
export type Filters = { categoryId: number | null; status: Occurrence['status'] | null; scope: 'QUEUE' | 'ALL' }
export const emptyFilters: Filters = { categoryId: null, status: null, scope: 'QUEUE' }
export function allowedStatuses(context: FilterContext, scope: Filters['scope']) {
  if (context === 'public') return ['PENDING', 'IN_ANALYSIS', 'RESOLVED'] satisfies Occurrence['status'][]
  if (context === 'admin' && scope === 'QUEUE') return ['PENDING', 'IN_ANALYSIS'] satisfies Occurrence['status'][]
  return occurrenceStatusSchema.options
}
export function parseFilters(params: URLSearchParams, context: FilterContext) {
  const next = new URLSearchParams(params)
  let invalid = false
  function single(key: string) {
    const values = params.getAll(key)
    if (values.length > 1 || values[0] === '') { invalid = true; return null }
    return values[0] ?? null
  }
  const rawScope = single('escopo')
  const scope = context === 'admin' && rawScope === 'todos' ? 'ALL' : 'QUEUE'
  if (rawScope !== null && (context !== 'admin' || rawScope !== 'todos')) invalid = true
  const rawCategory = single('categoria')
  const category = rawCategory !== null && /^[0-9]+$/.test(rawCategory) ? categoryIdSchema.safeParse(Number(rawCategory)) : null
  const categoryId = category?.success ? category.data : null
  if (rawCategory !== null && categoryId === null) invalid = true
  const rawStatus = single('estado')
  const parsed = occurrenceStatusSchema.safeParse(rawStatus)
  const status = parsed.success && allowedStatuses(context, scope).includes(parsed.data) ? parsed.data : null
  if (rawStatus !== null && status === null) invalid = true
  // Preserve positions of independent presentation parameters: map writes must
  // not trigger a competing navigation just to reorder already valid filters.
  if (categoryId === null) next.delete('categoria'); else next.set('categoria', String(categoryId))
  if (status === null) next.delete('estado'); else next.set('estado', status)
  if (scope === 'ALL') next.set('escopo', 'todos'); else next.delete('escopo')
  return { filters: { categoryId, status, scope } satisfies Filters, params: next, invalid }
}
export function filterQuery(filters: Filters, admin = false) {
  const params = new URLSearchParams()
  if (filters.categoryId !== null) params.set('categoryId', String(filters.categoryId))
  if (filters.status !== null) params.set('status', filters.status)
  if (admin) params.set('scope', filters.scope)
  return params.toString()
}
export function filterKey(filters: Filters) { return { categoryId: filters.categoryId, status: filters.status } }
export function changeFilters(params: URLSearchParams, changes: Partial<Filters>, context: FilterContext) {
  const next = new URLSearchParams(params)
  const current = parseFilters(params, context).filters
  const filters = { ...current, ...changes }
  if (filters.status && !allowedStatuses(context, filters.scope).includes(filters.status)) filters.status = null
  next.delete('categoria'); next.delete('estado'); next.delete('escopo'); next.delete('selecionado')
  if (filters.categoryId !== null) next.set('categoria', String(filters.categoryId))
  if (filters.status !== null) next.set('estado', filters.status)
  if (context === 'admin' && filters.scope === 'ALL') next.set('escopo', 'todos')
  if (context !== 'own') next.delete('pagina')
  return next
}
export function administrativeReturn(value: unknown) {
  const base = '/administracao/relatos'
  if (typeof value !== 'string' || (value !== base && !value.startsWith(`${base}?`))) return base
  const params = new URLSearchParams(value.split('?')[1])
  if (value.includes('#') || [...params.keys()].some(key => !['pagina', 'categoria', 'estado', 'escopo'].includes(key))) return base
  if (params.has('pagina') && (params.getAll('pagina').length !== 1 || !/^[1-9][0-9]*$/.test(params.get('pagina') ?? ''))) return base
  const result = parseFilters(params, 'admin')
  return result.invalid ? base : `${base}${result.params.size ? `?${result.params}` : ''}`
}
