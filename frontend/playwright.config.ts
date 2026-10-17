/// <reference types="node" />
import { defineConfig } from '@playwright/test'

// Browser tests for the main flows (e2e/). They drive the real app against the real backends,
// so start backend/api, backend/ws and Postgres first (see the README); the frontend dev server
// is started here if it isn't already running. One worker: quick match is one shared lobby, so
// two tests at once would end up racing each other.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    // The installed Chrome, so there's no browser download to run these.
    channel: 'chrome',
    // Races are desktop-only.
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun --bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
