export function CountDistribution({ items, total }: { items: { key: string, label: string, count: number }[], total: number }) {
  return <ul className="m-0 grid list-none gap-4 p-0">{items.map(item => <li key={item.key}>
    <div className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words">{item.label}</span><span>{item.count.toLocaleString('pt-BR')} {item.count === 1 ? 'relato' : 'relatos'}</span></div>
    <div aria-hidden="true" className="mt-2 h-2 rounded-control bg-surface-canvas">
      <div className="h-full rounded-control bg-brand-default" style={{ width: `${total === 0 ? 0 : 100 * item.count / total}%` }} />
    </div>
  </li>)}</ul>
}
