type TokenTree = { readonly [key: string]: string | TokenTree }

const primitives = {
  charcoal: '#2A2926', deep: '#1C1B19', soft: '#ECE8DD', tint: '#FFF1E8',
  peach: '#FF9F6E', peachDark: '#B24A18', link: '#AE4616',
  canvas: '#F4F1EA', white: '#FFFFFF', ink: '#2A2926', muted: '#69655D',
  line: '#E6E1D6', control: '#817B70', disabled: '#E9E5DC',
  pending: '#4A463F', pendingSoft: '#E9E5DC',
  green: '#2D6A3D', greenSoft: '#DCEBD8', amber: '#9A4012', amberSoft: '#FFE0CC',
  red: '#98291D', redSoft: '#F6D5D0',
} as const
const pair = (background: string, foreground: string) => ({ background, foreground })
const disabled = pair(primitives.disabled, primitives.muted)
const primary = pair(primitives.charcoal, primitives.white)
const secondary = pair(primitives.white, primitives.ink)
const quiet = pair(primitives.canvas, primitives.ink)

export const tokens = {
  primitives,
  brand: { default: primitives.charcoal, deep: primitives.deep, soft: primitives.soft, accent: primitives.peach },
  surface: { canvas: primitives.canvas, raised: primitives.white, soft: primitives.soft, tonal: primitives.tint },
  text: { primary: primitives.ink, secondary: primitives.muted, link: primitives.link },
  border: { subtle: primitives.line, control: primitives.control },
  action: {
    focus: { ring: primitives.deep, width: '3px', offset: '3px' },
    primary: { normal: primary, hover: pair(primitives.deep, primitives.white), active: pair(primitives.pending, primitives.white), disabled, loading: primary },
    secondary: { normal: secondary, hover: pair(primitives.soft, primitives.deep), active: pair(primitives.line, primitives.deep), disabled, loading: secondary },
    quiet: { normal: quiet, hover: pair(primitives.soft, primitives.deep), active: pair(primitives.line, primitives.deep), disabled, loading: quiet },
  },
  feedback: {
    success: pair(primitives.greenSoft, primitives.green), warning: pair(primitives.amberSoft, primitives.amber),
    danger: pair(primitives.redSoft, primitives.red), info: pair(primitives.soft, primitives.pending),
  },
  report: { pending: pair(primitives.pendingSoft, primitives.pending), analysis: pair(primitives.amberSoft, primitives.amber), resolved: pair(primitives.greenSoft, primitives.green), rejected: pair(primitives.redSoft, primitives.red) },
  typography: {
    family: 'Figtree, system-ui, -apple-system, "Segoe UI", sans-serif',
    size: { small: '0.875rem', body: '1rem', lead: '1.125rem', title: '1.5rem', display: 'clamp(2rem, 5vw, 3rem)' },
    weight: { regular: '400', medium: '500', semibold: '600', bold: '700', extra: '800' }, line: { body: '1.6', heading: '1.2' },
  },
  space: { '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem', '6': '1.5rem', '8': '2rem', '12': '3rem', '16': '4rem' },
  radius: { control: '1rem', card: '1.5rem', pill: '999px' },
  elevation: { card: '0 2px 8px #2A292608' },
  motion: { duration: '120ms', easing: 'ease-out', reduced: '0ms' },
  layout: { container: '64rem', reading: '42rem', target: '2.75rem' },
} as const satisfies TokenTree
