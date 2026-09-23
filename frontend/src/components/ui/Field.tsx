import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'

const controlStyles = 'w-full min-w-0 p-3 border border-border-control rounded-control bg-surface-raised text-text-primary placeholder:text-text-secondary placeholder:opacity-100 aria-invalid:border-feedback-danger-foreground disabled:bg-action-primary-disabled-background disabled:text-action-primary-disabled-foreground disabled:cursor-not-allowed'

type FieldProps = {
  id?: string
  label: string
  description?: string
  error?: string
  'aria-describedby'?: string
  'aria-invalid'?: ComponentProps<'input'>['aria-invalid']
}
type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: ComponentProps<'input'>['aria-invalid'] }
export function Field({ id, label, description, error, children, 'aria-describedby': describedBy, 'aria-invalid': invalid }: FieldProps & { children: (props: ControlProps) => ReactNode }) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const descriptionId = `${fieldId}-description`
  const errorId = `${fieldId}-error`
  const associations = [describedBy, description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined
  return <div className="grid min-w-0 gap-2">
    <label className="font-bold" htmlFor={fieldId}>{label}</label>
    {description && <p id={descriptionId} className="m-0 text-small text-text-secondary">{description}</p>}
    {children({ id: fieldId, 'aria-describedby': associations, 'aria-invalid': error ? true : invalid })}
    {error && <p id={errorId} className="m-0 text-small text-feedback-danger-foreground">{error}</p>}
  </div>
}
export function Input({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'input'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <input {...props} {...control} className={`${controlStyles} min-h-target ${className}`} />}
  </Field>
}
export function Textarea({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'textarea'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <textarea {...props} {...control} className={`${controlStyles} min-h-32 resize-y ${className}`} />}
  </Field>
}
export function Select({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'select'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <select {...props} {...control} className={`${controlStyles} min-h-target ${className}`} />}
  </Field>
}
