
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  address: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    city: z.string(),
  }),
}))
