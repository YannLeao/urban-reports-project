export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

const base = 'inline-flex items-center justify-center gap-2 min-h-target px-6 py-2 border rounded-control font-bold no-underline cursor-pointer transition-[background-color] duration-(--ds-motion-duration) ease-(--ds-motion-easing) disabled:cursor-not-allowed'

// Complete literal classes let Tailwind detect every state at build time.
const variants: Record<ButtonVariant, string> = {
  primary: [
    'border-text-primary bg-action-primary-normal-background text-action-primary-normal-foreground',
    'not-disabled:hover:bg-action-primary-hover-background not-disabled:hover:text-action-primary-hover-foreground',
    'not-disabled:active:bg-action-primary-active-background not-disabled:active:text-action-primary-active-foreground',
    '[&:disabled:not([data-loading])]:bg-action-primary-disabled-background [&:disabled:not([data-loading])]:text-action-primary-disabled-foreground',
    'data-loading:bg-action-primary-loading-background data-loading:text-action-primary-loading-foreground',
  ].join(' '),
  secondary: [
    'border-border-control bg-action-secondary-normal-background text-action-secondary-normal-foreground',
    'not-disabled:hover:bg-action-secondary-hover-background not-disabled:hover:text-action-secondary-hover-foreground',
    'not-disabled:active:bg-action-secondary-active-background not-disabled:active:text-action-secondary-active-foreground',
    '[&:disabled:not([data-loading])]:bg-action-secondary-disabled-background [&:disabled:not([data-loading])]:text-action-secondary-disabled-foreground',
    'data-loading:bg-action-secondary-loading-background data-loading:text-action-secondary-loading-foreground',
  ].join(' '),
  quiet: [
    'border-transparent bg-action-quiet-normal-background text-action-quiet-normal-foreground',
    'not-disabled:hover:bg-action-quiet-hover-background not-disabled:hover:text-action-quiet-hover-foreground',
    'not-disabled:active:bg-action-quiet-active-background not-disabled:active:text-action-quiet-active-foreground',
    '[&:disabled:not([data-loading])]:bg-action-quiet-disabled-background [&:disabled:not([data-loading])]:text-action-quiet-disabled-foreground',
    'data-loading:bg-action-quiet-loading-background data-loading:text-action-quiet-loading-foreground',
  ].join(' '),
}

export function buttonStyles(variant: ButtonVariant = 'primary', className = '') {
  return `${base} ${variants[variant]} ${className}`
}
