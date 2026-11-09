import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { categoriesSchema, categoryIdSchema } from './category'
import { Icon } from '../../components/ui/Icon'
import { OccurrencePin } from '../location/pins/OccurrencePin'
import { Select } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Feedback'
import { Button } from '../../components/ui/Button'
import { publicRequest } from '../../lib/api'
import { occurrenceStatusLabel } from './occurrence'
import { allowedStatuses, changeFilters, parseFilters, type FilterContext, type Filters } from './filters'

export function OccurrenceFilters({ context, total }: { context: FilterContext; total?: number }) {
  const [params, setParams] = useSearchParams()
  const parsed = useMemo(() => parseFilters(params, context), [params, context])
  const { filters } = parsed
  const [notice, setNotice] = useState(parsed.invalid ? 'Filtros inválidos foram ajustados para opções permitidas.' : '')
  useEffect(() => {
    if (parsed.invalid || params.toString() !== parsed.params.toString()) {
      if (parsed.invalid) setNotice('Filtros inválidos foram ajustados para opções permitidas.')
      setParams(parsed.params, { replace: true })
    }
  }, [params, parsed.invalid, parsed.params, setParams])
  const categories = useQuery({
    queryKey: ['public', 'occurrence-categories'],
    queryFn: async ({ signal }) => categoriesSchema.parse(await (await publicRequest('/api/public/occurrence-categories', signal)).json()),
    retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
  })
  function change(changes: Partial<Filters>) {
    setNotice(changes.scope === 'QUEUE' && filters.status && !allowedStatuses(context, 'QUEUE').includes(filters.status)
      ? 'O estado final foi removido ao voltar à fila de moderação.' : '')
    setParams(changeFilters(params, changes, context))
  }
  const category = categories.data?.find(item => item.id === filters.categoryId)
  return <div className="my-4 grid min-w-0 gap-3" aria-label="Filtros dos relatos">
    {notice && <Alert>{notice}</Alert>}
    {context === 'admin' && <div className="flex flex-wrap gap-2" aria-label="Escopo da consulta">
      <Button variant="secondary" aria-pressed={filters.scope === 'QUEUE'} onClick={() => change({ scope: 'QUEUE' })}>Fila de moderação</Button>
      <Button variant="secondary" aria-pressed={filters.scope === 'ALL'} onClick={() => change({ scope: 'ALL' })}>Todos os relatos</Button>
    </div>}
    {context === 'public' && <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
      {([{ value: null, label: 'Todas', icon: 'map' }, { value: 'ACCEPTED', label: 'Aceitas', icon: 'list' }, { value: 'RESOLVED', label: 'Resolvidas', icon: 'check' }] as const).map(item => <Button key={item.label} size="compact" className="flex-1 gap-1 whitespace-nowrap text-small" variant={filters.status === item.value ? 'primary' : 'secondary'} aria-pressed={filters.status === item.value} onClick={() => change({ status: item.value })}><Icon name={item.icon} className="size-4" />{item.label}</Button>)}
    </div>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Select label="Categoria" value={filters.categoryId ?? ''} onChange={event => change({ categoryId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">Todas as categorias</option>
        {categories.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      {context !== 'public' && <Select label="Estado" value={filters.status ?? ''} onChange={event => change({ status: event.target.value ? allowedStatuses(context, filters.scope).find(status => status === event.target.value) ?? null : null })}>
        <option value="">Todos os estados</option>
        {allowedStatuses(context, filters.scope).map(status => <option key={status} value={status}>{occurrenceStatusLabel(status)}</option>)}
      </Select>}
    </div>
    {context === 'public' && categories.data && <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Atalhos de categoria">
      {categories.data.map(item => <button key={item.id} type="button" aria-label={`Filtrar: ${item.name}`} aria-pressed={filters.categoryId === item.id} onClick={() => change({ categoryId: filters.categoryId === item.id ? null : item.id })} className={`flex min-h-target shrink-0 items-center gap-1 rounded-control border px-3 py-2 text-small font-bold ${filters.categoryId === item.id ? 'border-brand-default bg-brand-accent' : 'border-border-subtle bg-surface-raised hover:bg-surface-soft'}`}><OccurrencePin categoryId={categoryIdSchema.safeParse(item.id).data ?? 8} size={24} />{item.name}</button>)}
    </div>}
    {categories.isPending && <p role="status" className="m-0">Carregando categorias…</p>}
    {categories.isError && <Alert tone="danger">Não conseguimos carregar as categorias. <Button variant="secondary" onClick={() => { void categories.refetch() }}>Tentar carregar categorias novamente</Button></Alert>}
    {(filters.categoryId !== null || filters.status !== null) && <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 text-small" role="status">{[filters.categoryId !== null ? category?.name ?? 'Categoria selecionada' : null, filters.status ? occurrenceStatusLabel(filters.status) : null].filter(Boolean).join(' · ')}{total !== undefined ? ` · ${total} relatos` : ''}</p>
      <Button variant="quiet" onClick={() => change({ categoryId: null, status: null })}>Limpar filtros</Button>
    </div>}
    {filters.categoryId === null && filters.status === null && total !== undefined && total > 0 && <p role="status" className="m-0 text-small">{total} relatos</p>}
  </div>
}
