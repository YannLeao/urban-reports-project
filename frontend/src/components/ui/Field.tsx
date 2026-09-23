import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'

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
  return <div className="field">
    <label htmlFor={fieldId}>{label}</label>
    {description && <p id={descriptionId} className="field-description">{description}</p>}
    {children({ id: fieldId, 'aria-describedby': associations, 'aria-invalid': error ? true : invalid })}
    {error && <p id={errorId} className="field-error">{error}</p>}
  </div>
}
export function Input({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'input'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <input {...props} {...control} className={`control ${className}`} />}
  </Field>
}
export function Textarea({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'textarea'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <textarea {...props} {...control} className={`control ${className}`} />}
  </Field>
}
export function Select({ label, description, error, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, className = '', ...props }: ComponentProps<'select'> & FieldProps) {
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {(control) => <select {...props} {...control} className={`control ${className}`} />}
  </Field>
}
