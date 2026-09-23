import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { getJson } from '../../lib/api'

// HealthController currently returns exactly the operational status UP.
const healthSchema = z.object({ status: z.literal('UP') })

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async ({ signal }) => {
      const result = healthSchema.safeParse(await getJson('/api/health', signal))
      if (!result.success) throw new Error('O serviço enviou uma resposta que não conseguimos reconhecer.')
      return result.data
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Re-entering the page checks availability again; no background polling.
    staleTime: 0,
  })
}
