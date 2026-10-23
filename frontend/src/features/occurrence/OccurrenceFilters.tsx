import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { categoriesSchema } from './category'
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
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Select label="Categoria" value={filters.categoryId ?? ''} onChange={event => change({ categoryId: event.target.value ? Number(event.target.value) : null })}>
        <option value="">Todas as categorias</option>
        {categories.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      <Select label="Estado" value={filters.status ?? ''} onChange={event => change({ status: event.target.value ? allowedStatuses(context, filters.scope).find(status => status === event.target.value) ?? null : null })}>
        <option value="">Todos os estados</option>
        {allowedStatuses(context, filters.scope).map(status => <option key={status} value={status}>{occurrenceStatusLabel(status)}</option>)}
      </Select>
    </div>
    {categories.isPending && <p role="status" className="m-0">Carregando categorias…</p>}
    {categories.isError && <Alert tone="danger">Não conseguimos carregar as categorias. <Button variant="secondary" onClick={() => { void categories.refetch() }}>Tentar carregar categorias novamente</Button></Alert>}
    {(filters.categoryId !== null || filters.status !== null) && <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 text-small" role="status">{[filters.categoryId !== null ? category?.name ?? 'Categoria selecionada' : null, filters.status ? occurrenceStatusLabel(filters.status) : null].filter(Boolean).join(' · ')}{total !== undefined ? ` · ${total} relatos` : ''}</p>
      <Button variant="quiet" onClick={() => change({ categoryId: null, status: null })}>Limpar filtros</Button>
    </div>}
    {filters.categoryId === null && filters.status === null && total !== undefined && total > 0 && <p role="status" className="m-0 text-small">{total} relatos</p>}
  </div>
}
