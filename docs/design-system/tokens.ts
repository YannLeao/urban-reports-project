type TokenTree = { readonly [key: string]: string | TokenTree }

const primitives = {
  petroleum: '#0F5D66', deep: '#083F46', soft: '#DDF3F3',
  coral: '#F97360', coralHover: '#F58A79', coralActive: '#EE6855',
  canvas: '#F7FAFA', white: '#FFFFFF', ink: '#152426', muted: '#526568',
  line: '#CEDBDC', control: '#6C8285', disabled: '#E4EBEC',
  green: '#216345', greenSoft: '#EAF5EE', amber: '#785009', amberSoft: '#FFF5DA',
  red: '#A32E37', redSoft: '#FDEEF0', blue: '#225E87', blueSoft: '#EAF3FA',
} as const
const pair = (background: string, foreground: string) => ({ background, foreground })
const disabled = pair(primitives.disabled, primitives.muted)
const primary = pair(primitives.coral, primitives.ink)
const secondary = pair(primitives.white, primitives.petroleum)
const quiet = pair(primitives.canvas, primitives.petroleum)

export const tokens = {
  primitives,
  brand: { default: primitives.petroleum, deep: primitives.deep, soft: primitives.soft, accent: primitives.coral },
  surface: { canvas: primitives.canvas, raised: primitives.white },
  text: { primary: primitives.ink, secondary: primitives.muted, link: primitives.petroleum },
  border: { subtle: primitives.line, control: primitives.control },
  action: {
    focus: { ring: primitives.deep, width: '3px', offset: '3px' },
    primary: { normal: primary, hover: pair(primitives.coralHover, primitives.ink), active: pair(primitives.coralActive, primitives.ink), disabled, loading: primary },
    secondary: { normal: secondary, hover: pair(primitives.soft, primitives.deep), active: pair(primitives.line, primitives.deep), disabled, loading: secondary },
    quiet: { normal: quiet, hover: pair(primitives.soft, primitives.deep), active: pair(primitives.line, primitives.deep), disabled, loading: quiet },
  },
  feedback: {
    success: pair(primitives.greenSoft, primitives.green), warning: pair(primitives.amberSoft, primitives.amber),
    danger: pair(primitives.redSoft, primitives.red), info: pair(primitives.blueSoft, primitives.blue),
  },
  typography: {
    family: 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif',
    size: { small: '0.875rem', body: '1rem', lead: '1.125rem', title: '1.5rem', display: 'clamp(2rem, 5vw, 3rem)' },
    weight: { regular: '400', bold: '700' }, line: { body: '1.6', heading: '1.2' },
  },
  space: { '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem', '6': '1.5rem', '8': '2rem', '12': '3rem', '16': '4rem' },
  radius: { control: '0.5rem', card: '1rem', pill: '999px' },
  elevation: { card: '0 2px 8px #15242608' },
  motion: { duration: '120ms', easing: 'ease-out', reduced: '0ms' },
  layout: { container: '64rem', reading: '42rem', target: '2.75rem' },
} as const satisfies TokenTree
