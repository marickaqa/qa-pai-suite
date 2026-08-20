import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(import.meta.dirname, '.env') })

/**
 * Read a required env var, or fail immediately with a clear message.
 *
 * No hardcoded URL fallback on purpose. A `|| 'https://...'` default is a
 * second place a domain can drift, and — worse — a literal fallback is
 * invisible to prodGuard, which only inspects process.env values. Failing loud
 * on a missing var keeps every target flowing through the env, where the guard
 * can see it.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in ` +
      `(or export ${name} in CI).`
    )
  }
  return value
}

export default defineConfig({
  globalSetup: './global-setup.ts',
  timeout: 60000,
  // More retries in CI to absorb transient dev-backend slowness; locally keep
  // it at 0 for fast, honest feedback while developing.
  retries: process.env.CI ? 1 : 0,
  // Serial. The SaaS active-org is server-side state keyed to one token, and
  // every spec shares one saved session — parallel workers would race it.
  workers: 1,
  expect: {
    // Global assertion timeout. The dev backend is shared and occasionally
    // slow; a higher default beats hunting down each flaky assertion by hand.
    timeout: 10000,
  },
  use: {
    baseURL: required('SAAS_URL'),
    storageState: 'reports/saas-session.json',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
    },
  },
  projects: [
    {
      name: 'core-saas-ui',
      testDir: './tests/core/ui/saas',
    },
  ],
})