import { z } from 'zod'

export const artifactSchema = z.object({
  commit: z.string().nullable(),
  pipeline: z.string().nullable(),
  ref: z.string().nullable(),
  production: z.boolean(),
  apiUrl: z.string(),
})

export type Artifact = z.infer<typeof artifactSchema>
