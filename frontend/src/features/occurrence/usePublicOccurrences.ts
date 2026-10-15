import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { publicRequest } from '../../lib/api'
import { publicOccurrencePageSchema, publicOccurrenceSchema } from './public-occurrence'

export const PUBLIC_PAGE_SIZE = 20

export function usePublicOccurrences(page: number) {
  return useQuery({
    queryKey: ['public', 'occurrences', page],
    queryFn: async ({ signal }) => {
      const response = await publicRequest(`/api/public/occurrences?page=${page}&size=${PUBLIC_PAGE_SIZE}`, signal)
      const payload: unknown = await response.json()
      return publicOccurrencePageSchema.parse(payload)
    },
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function usePublicOccurrence(id: string | undefined) {
  return useQuery({
    queryKey: ['public', 'occurrences', 'detail', id],
    queryFn: async ({ signal }) => {
      const occurrenceId = z.uuid().parse(id)
      const response = await publicRequest(`/api/public/occurrences/${occurrenceId}`, signal)
      const payload: unknown = await response.json()
      return publicOccurrenceSchema.parse(payload)
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
}