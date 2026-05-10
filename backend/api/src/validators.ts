import { z } from 'zod'

export const createQuoteSchema = z.object({
  quote: z.string().min(1),
  author: z.string().min(1),
  source: z.string().min(1),
})

export const updateQuoteSchema = z.object({
  quote: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
})
