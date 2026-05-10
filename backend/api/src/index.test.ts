import { describe, it, expect } from 'bun:test'

const baseUrl = process.env.API_URL

describe('GET /quotes', () => {
  it('should return 200', async () => {
    const res = await fetch(`${baseUrl}/quotes`)
    expect(res.status).toBe(200)
  })

  it('should return an array', async () => {
    const res = await fetch(`${baseUrl}/quotes`)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })
})

describe('GET /quotes/:id', () => {
  it('should return 404 for non-existent id', async () => {
    const res = await fetch(`${baseUrl}/quotes/9999999`)
    expect(res.status).toBe(404)
  })

  it('should return 200 for existing quote', async () => {
    const created = await fetch(`${baseUrl}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: 'test', author: 'test', source: 'test' }),
    })
    const quote = await created.json()
    const res = await fetch(`${baseUrl}/quotes/${quote.id}`)
    expect(res.status).toBe(200)
  })
})

describe('POST /quotes', () => {
  it('should create a quote and return 201', async () => {
    const res = await fetch(`${baseUrl}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: 'test', author: 'test', source: 'test' }),
    })
    expect(res.status).toBe(201)
  })

  it('should return 400 for missing fields', async () => {
    const res = await fetch(`${baseUrl}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: 'test' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('PUT /quotes/:id', () => {
  it('should update a quote and return 200', async () => {
    const created = await fetch(`${baseUrl}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: 'test', author: 'test', source: 'test' }),
    })
    const quote = await created.json()
    const res = await fetch(`${baseUrl}/quotes/${quote.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Updated Author' }),
    })
    expect(res.status).toBe(200)
  })

  it('should return 404 for non-existent id', async () => {
    const res = await fetch(`${baseUrl}/quotes/9999999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Updated Author' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /quotes/:id', () => {
  it('should delete a quote and return 204', async () => {
    const created = await fetch(`${baseUrl}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: 'test', author: 'test', source: 'test' }),
    })
    const quote = await created.json()
    const res = await fetch(`${baseUrl}/quotes/${quote.id}`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(204)
  })

  it('should return 404 for non-existent id', async () => {
    const res = await fetch(`${baseUrl}/quotes/9999999`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
  })
})
