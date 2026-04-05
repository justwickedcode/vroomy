//routing
import { Hono } from 'hono'
import { db } from './db'
import { quotes } from './db/schema'
import { eq } from 'drizzle-orm'

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
  const newQuote = await db.insert(quotes).values(body).returning()
  return c.json(newQuote[0], 201)
})

app.patch('/quotes/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const update = await db.update(quotes).set(body).where(eq(quotes.id, id)).returning()
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
  return c.json(null, 204)
})

export default app
