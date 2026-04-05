//tells drizzle kit where the schema is and how to connect to database -> run migrations
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: 'postgresql://user:password@localhost:5432/mydb',
  },
})
