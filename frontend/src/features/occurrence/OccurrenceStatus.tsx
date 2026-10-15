import { occurrenceStatusLabel, type Occurrence } from './occurrence'

const appearances = {
  PENDING: { classes: 'bg-report-pending-background text-report-pending-foreground', symbol: '◷' },
  IN_ANALYSIS: { classes: 'bg-report-analysis-background text-report-analysis-foreground', symbol: '⌕' },
  RESOLVED: { classes: 'bg-report-resolved-background text-report-resolved-foreground', symbol: '✓' },
  REJECTED: { classes: 'bg-report-rejected-background text-report-rejected-foreground', symbol: '×' },
} satisfies Record<Occurrence['status'], { classes: string; symbol: string }>

export function OccurrenceStatus({ status }: { status: Occurrence['status'] }) {
  const appearance = appearances[status]
  return <span className={`inline-flex max-w-full items-center gap-2 rounded-pill px-3 py-1 text-small font-bold ${appearance.classes}`}>
    <span aria-hidden="true">{appearance.symbol}</span>{occurrenceStatusLabel(status)}
  </span>
}
