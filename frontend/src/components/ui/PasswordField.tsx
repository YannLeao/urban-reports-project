import { useState, type ComponentProps } from 'react'
import { controlStyles, Field, type Input } from './Field'
import { Icon } from './Icon'
import { Button } from './Button'

type Props = Omit<ComponentProps<typeof Input>, 'type'>

/** Controlled or native input; the ref always targets the input, never the toggle. */
export function PasswordField({ label, description, error, id, 'aria-describedby': describedBy,
  'aria-invalid': invalid, className = '', ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return <Field {...{ label, description, error, id }} aria-describedby={describedBy} aria-invalid={invalid}>
    {control => <div className="flex min-w-0 items-center gap-2">
      <input {...props} {...control} type={visible ? 'text' : 'password'} className={`${controlStyles} min-h-target ${className}`} />
      <Button variant="secondary" size="compact" className="min-w-target" disabled={props.disabled}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-controls={control.id}
        onClick={() => setVisible(current => !current)}><Icon name={visible ? 'eyeOff' : 'eye'} /></Button>
    </div>}
  </Field>
}
