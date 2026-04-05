//setting up connection to PostgreSQL database

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'

const client = postgres('postgresql://user:password@localhost:5432/mydb')
export const db = drizzle(client, { schema })
