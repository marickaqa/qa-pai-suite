import { chromium, expect, FullConfig, Page } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'
import { assertNotProd } from './utils/prodGuard'

dotenv.config({ path: path.resolve(import.meta.dirname, '.env') })

const SAAS_SESSION = 'reports/saas-session.json'

// No fallback on any of these. A missing value must fail loud here — with a
// message that names the var — rather than silently logging in as an empty
// string and failing three steps later at a confusing point.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set in .env — see .env.example`)
  }
  return value
}

const SAAS_URL = requireEnv('SAAS_URL')
const SAAS_EMAIL = requireEnv('SAAS_EMAIL')
const SAAS_PASSWORD = requireEnv('SAAS_PASSWORD')

// On failure, capture a screenshot for local debugging. reports/ is fully
// gitignored, so these can never end up in the repo.
async function captureFailure(page: Page, name: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ ${name} session generation failed: ${message}`)
  try {
    await page.screenshot({ path: `reports/${name}-login-failure.png` })
    console.error(`   Screenshot saved to reports/${name}-login-failure.png (local only, gitignored)`)
  } catch {
    // page may already be closed — nothing more we can do
  }
}

async function globalSetup(_config: FullConfig) {
  // Refuse to run if SAAS_URL points anywhere but a known dev host.
  assertNotProd()

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(SAAS_URL + '/login')
    // Condition-based wait, not networkidle (which can hang on the SPA).
    await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 30000 })
    await page.fill('input[name="email"]', SAAS_EMAIL)
    await page.fill('input[name="password"]', SAAS_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((url: URL) => !url.toString().includes('login'), { timeout: 60000 })

    // The account cold-boots on its default org, which has no fixtures. Switch
    // into noctocode.dev, which holds the support bots / conversations / agents
    // the specs depend on.
    const orgTrigger = page.locator('button:has(svg.lucide-chevrons-up-down)')
    await orgTrigger.waitFor({ state: 'visible', timeout: 30000 })
    const activeOrg = (await orgTrigger.textContent()) || ''
    if (!activeOrg.includes('noctocode.dev')) {
      await orgTrigger.click()
      // The open dropdown holds two noctocode.dev buttons: the sidebar trigger
      // itself and the menu item. Target the menu item specifically — matching
      // both causes strict-mode ambiguity and an intermittent wrong switch.
      await page
        .getByRole('menuitem', { name: /noctocode\.dev/i })
        .or(page.locator('button.rounded-md').filter({ hasText: /noctocode\.dev/i }))
        .first()
        .click()
      await expect(orgTrigger).toContainText('noctocode.dev', { timeout: 15000 })
    }

    // The active org is server-side state keyed to the token, and the SPA
    // cold-boots on the account default before reconciling. A hard reload
    // forces a fresh server read: if the switch persisted for this token it
    // comes back as noctocode.dev. Assert AFTER the reload so a switch that
    // didn't stick fails setup loudly instead of saving a session that boots
    // every spec on the wrong org.
    await page.reload()
    await orgTrigger.waitFor({ state: 'visible', timeout: 30000 })
    await expect(
      orgTrigger,
      'SaaS session did not persist noctocode.dev after reload — aborting setup'
    ).toContainText('noctocode.dev', { timeout: 30000 })

    await context.storageState({ path: SAAS_SESSION })
    console.log('✅ SaaS session generated (org: noctocode.dev)')
  } catch (e: unknown) {
    await captureFailure(page, 'saas', e)
    throw e
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }
}

export default globalSetup