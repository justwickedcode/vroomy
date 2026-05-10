//routing
import { Hono } from 'hono'
import { db } from './db'
import { quotes } from './db/schema'
import { eq } from 'drizzle-orm'
import { createQuoteSchema, updateQuoteSchema } from './validators'

const app = new Hono()

app.get('/quotes', async (c) => {
  const allQuotes = await db.select().from(quotes)
  return c.json(allQuotes)
})

app.get('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const quote = await db.select().from(quotes).where(eq(quotes.id, id))
  if (quote.length == 0) {
    return c.json(null, 404)
  }
  return c.json(quote[0], 200)
})

app.post('/quotes', async (c) => {
  const body = await c.req.json()
  const parsed = createQuoteSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }
  const newQuote = await db.insert(quotes).values(parsed.data).returning()
  return c.json(newQuote[0], 201)
})

app.put('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const parsed = updateQuoteSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }
  const update = await db.update(quotes).set(parsed.data).where(eq(quotes.id, id)).returning()
  if (update.length == 0) {
    return c.json('Selected Id does not exist!', 404)
  }

  return c.json(update[0], 200)
})

app.delete('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const deleted = await db.delete(quotes).where(eq(quotes.id, id)).returning()
  if (deleted.length == 0) {
    return c.json(null, 404)
  }
  return c.body(null, 204)
})

export default app
