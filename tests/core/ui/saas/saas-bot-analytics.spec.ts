import { test, expect, type Page } from '@playwright/test'
import { forceOrg } from '../../../../utils/saasOrg'

/**
 * saas-bot-analytics.spec.ts — per-agent analytics (/agent/{id}/analytics).
 *
 * Same surface as org analytics, scoped to one agent. Fixture: noctocode-test
 * (edb91849), a stable chatbot in noctocode.dev — pinned by UUID, not name.
 *
 * NOTE: this page shares the org-analytics hydration behaviour, which is
 * intermittently broken on dev (spinner hang — flagged to Krištof). If a test
 * here proves intermittently unhydrated the same way, it gets parked, not faked.
 */

const CHAT_BOT_ID = 'edb91849-b4eb-4dbc-aa9f-5ae816833e56' // noctocode-test
const BOT_ANALYTICS_PATH = `/agent/${CHAT_BOT_ID}/analytics`

async function gotoBotAnalytics(page: Page) {
  await forceOrg(page)
  await page.goto(BOT_ANALYTICS_PATH)
  await expect(page.getByText('Bot overview')).toBeVisible({ timeout: 30000 })
}

test.describe('Core — SaaS Bot Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await gotoBotAnalytics(page)
  })

  test('shows the Bot overview heading and description', async ({ page }) => {
    await expect(page.getByText('Bot overview')).toBeVisible()
    await expect(page.getByText(/Activity for this (chatbot|agent|bot)/i)).toBeVisible()
  })

  test('shows Messages, Sessions and Tokens metrics', async ({ page }) => {
    await expect(page.getByText('Messages', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Sessions', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Tokens used', { exact: true })).toBeVisible()
  })

  test('shows percentage-change indicators', async ({ page }) => {
    await expect
      .poll(async () => page.getByText(/[+-]\d+(\.\d+)?%/).count(), { timeout: 15000 })
      .toBeGreaterThan(0)
  })

  test('token usage total equals input plus output', async ({ page }) => {
    // Same invariant as org analytics, scoped to this bot.
    const card = page
      .locator('div')
      .filter({ hasText: /Token usage/ })
      .filter({ hasText: /Input/ })
      .filter({ hasText: /Output/ })
      .last()
    await expect(card).toBeVisible({ timeout: 30000 })

    const readInts = async () => {
      const raw = (await card.innerText()).replace(/\u00a0/g, ' ')
      const total = raw.match(/([\d,]{4,})/)?.[1]
      const input = raw.match(/Input\s+([\d,]+)/i)?.[1]
      const output = raw.match(/Output\s+([\d,]+)/i)?.[1]
      return { total, input, output }
    }
    await expect
      .poll(async () => {
        const { total, input, output } = await readInts()
        return Boolean(total && input && output)
      }, { message: 'token card did not hydrate its numbers', timeout: 15000 })
      .toBe(true)

    const { total, input, output } = await readInts()
    const n = (s: string | undefined) => Number((s || '').replace(/,/g, ''))
    expect(n(input) + n(output), `input(${input}) + output(${output}) != total(${total})`).toBe(n(total))
  })

  test('shows the Activity over time chart with period toggles', async ({ page }) => {
    await expect(page.getByText('Activity over time')).toBeVisible()
    // Corrected from the old spec's "Yearly" — org analytics proved it's these four.
    for (const label of ['Daily', 'Weekly', 'Monthly', 'All time']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
  })

  test('shows the Guardrail triggers table with its columns', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Guardrail triggers' })).toBeVisible()
    await expect(page.getByText(/Messages blocked by safety rules for this (chatbot|agent|bot)/i)).toBeVisible()
    await expect(page.getByText('Category', { exact: true })).toBeVisible()
    await expect(page.getByText('Count', { exact: true })).toBeVisible()
    await expect(page.getByText('Last triggered', { exact: true })).toBeVisible()
  })
})