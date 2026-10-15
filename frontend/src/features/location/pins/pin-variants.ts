import type { CategoryId } from '../../occurrence/category'

export const categoryPins = {
  1: 'iluminacao', 2: 'buraco', 3: 'limpeza', 4: 'saneamento',
  5: 'generico', 6: 'generico', 7: 'arborizacao', 8: 'generico',
} as const satisfies Record<CategoryId, PinVariant>
export type PinVariant = 'iluminacao' | 'buraco' | 'limpeza' | 'saneamento' | 'arborizacao' | 'generico'
