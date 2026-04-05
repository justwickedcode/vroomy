//Defining quotes table
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const quotes = pgTable('quotes', {
  id: serial('id').primaryKey(),
  quote: text('quote').notNull(),
  source: text('source').notNull(),
  author: text('author').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
