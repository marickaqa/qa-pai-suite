import { test, expect, type Page } from '@playwright/test'

/**
 * saas-dashboard.spec.ts — the Overview page at /dashboard/overview.
 *
 * Presence checks are smoke only. The real assertions are BEHAVIORAL:
 *  - the "+ New" controls actually open the create-agent wizard,
 *  - the theme toggle actually flips the <html> theme (and restores it),
 *  - the headline agent total actually equals its breakdown AND the number of
 *    agent rows rendered — an arithmetic invariant, not a hardcoded count.
 */

const OVERVIEW = '/dashboard/overview'

const orgTrigger = (page: Page) =>
    page.locator('button:has(svg.lucide-chevrons-up-down)')

// Read the TOTAL AGENTS card: headline number + "X Support · Y Chatbot".
async function readTotals(page: Page) {
    const card = page
        .locator('div')
        .filter({ hasText: /TOTAL AGENTS/ })
        .filter({ hasText: /Support\s*·/ })
        .last()
    await expect(card, 'TOTAL AGENTS card not found').toBeVisible()
    const raw = (await card.innerText()).replace(/\u00a0/g, ' ')
    const totalM = raw.match(/TOTAL AGENTS\s*(\d+)/i)
    const bdM = raw.match(/(\d+)\s*Support\s*·\s*(\d+)\s*Chatbot/i)
    expect(totalM, `couldn't read headline total, card text: "${raw}"`).not.toBeNull()
    expect(bdM, `couldn't read breakdown, card text: "${raw}"`).not.toBeNull()
    return { total: Number(totalM![1]), support: Number(bdM![1]), chatbot: Number(bdM![2]) }
}

test.describe('Core — SaaS Dashboard (Overview)', () => {
    test.describe('unauthenticated', () => {
        test.use({ storageState: { cookies: [], origins: [] } })

        test('redirects unauthenticated users to login', async ({ page }) => {
            await page.goto(OVERVIEW)
            await page.waitForURL(/login/, { timeout: 20000 })
            expect(page.url()).toContain('login')
        })
    })

    test.describe('authenticated', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto(OVERVIEW)
            await expect(orgTrigger(page)).toContainText(/noctocode\.dev/i, { timeout: 30000 })
        })

        // --- smoke (presence) ---

        test('lands on the overview page', async ({ page }) => {
            expect(page.url()).toContain('/dashboard/overview')
        })

        test('shows the four metric cards', async ({ page }) => {
            await expect(page.getByText('TOTAL AGENTS')).toBeVisible()
            await expect(page.getByText('MESSAGES THIS MONTH')).toBeVisible()
            await expect(page.getByText('SESSIONS THIS MONTH')).toBeVisible()
            await expect(page.getByText('TOKEN USAGE')).toBeVisible()
        })

        test('shows the Support bots and Chatbots sections', async ({ page }) => {
            await expect(page.getByText('Embeddable widgets grounded on your docs.')).toBeVisible()
            await expect(page.getByText('Open-ended assistants with tools and memory.')).toBeVisible()
        })

        test('org picker shows the active org', async ({ page }) => {
            await expect(orgTrigger(page)).toContainText(/noctocode\.dev/i)
        })

        test('shows the primary navigation items', async ({ page }) => {
            for (const item of ['Overview', 'Analytics', 'Support bots', 'Chatbots', 'Conversations', 'Team', 'Settings', 'Admin Panel']) {
                await expect(page.getByText(item, { exact: true }).first()).toBeVisible()
            }
        })

        // --- behavioral ---

        test('agent totals are internally consistent (headline = breakdown = rendered rows)', async ({ page }) => {
            // Wait for real data BEFORE reading any numbers. The TOTAL AGENTS card
            // shows a placeholder 0 pre-hydration, and readTotals() will happily parse
            // that stale 0 — so anchor on the agent rows actually existing first.
            const agentLinks = page.locator('a[href*="/agent/"]')
            await expect(agentLinks.first()).toBeVisible({ timeout: 15000 })

            const { total, support, chatbot } = await readTotals(page)
            // A 0 total here means the card never hydrated — fail loud, don't pass silently.
            expect(total, 'TOTAL AGENTS still 0 after rows rendered — card did not hydrate').toBeGreaterThan(0)
            expect(support + chatbot, 'breakdown does not sum to the headline total').toBe(total)

            // Each agent renders twice (row wrapper + inner control); dedupe by UUID.
            const distinctAgents = async () => {
                const hrefs = await agentLinks.evaluateAll((els) =>
                    els.map((el) => el.getAttribute('href') || '')
                )
                const ids = new Set(
                    hrefs
                        .map((h) => h.match(/\/agent\/([0-9a-f-]{36})/i)?.[1])
                        .filter((id): id is string => Boolean(id))
                )
                return ids.size
            }

            await expect
                .poll(distinctAgents, { message: 'distinct agent rows != headline total', timeout: 10000 })
                .toBe(total)
        })

        test('header "+ New" opens the create-agent wizard', async ({ page }) => {
            await page.getByRole('button', { name: /new/i }).first().click()
            await page.waitForURL(/\/new\b/, { timeout: 20000 })
            // Proves the real wizard opened, not just that the URL changed.
            await expect(page.getByRole('button', { name: /Support chatbot/i })).toBeVisible({ timeout: 30000 })
        })

        test('section "+ New" controls open the create flow', async ({ page }) => {
            for (const desc of [
                'Embeddable widgets grounded on your docs.',
                'Open-ended assistants with tools and memory.',
            ]) {
                await page.goto(OVERVIEW)
                await expect(orgTrigger(page)).toContainText(/noctocode\.dev/i)
                const section = page.locator('div').filter({ hasText: desc }).last()
                const newCtl = section
                    .getByRole('link', { name: /new/i })
                    .or(section.getByRole('button', { name: /new/i }))
                    .first()
                await expect(newCtl, `no "+ New" control in section: ${desc}`).toBeVisible()
                await newCtl.click()
                await page.waitForURL(/\/new\b/, { timeout: 20000 })
                await expect(page.getByRole('button', { name: /Support chatbot/i })).toBeVisible({ timeout: 30000 })
            }
        })

        test('theme toggle flips the theme and restores it', async ({ page }) => {
            const html = page.locator('html')
            const hasDark = async () =>
                ((await html.getAttribute('class')) || '').split(/\s+/).includes('dark')

            // Icon shown reflects the CURRENT theme: sun when dark, moon when light.
            // If the toggle isn't found, the lucide icon names differ — paste the
            // button's DOM and I'll fix the selector.
            const iconFor = (dark: boolean) => (dark ? 'sun' : 'moon')
            const buttonFor = (dark: boolean) =>
                page.locator(`button:has(svg.lucide-${iconFor(dark)})`)

            const started = await hasDark()
            const enter = buttonFor(started)
            await expect(enter, 'theme toggle button not found').toBeVisible()
            await enter.click()
            await expect.poll(hasDark, { timeout: 10000 }).toBe(!started) // theme actually changed

            await buttonFor(!started).click()
            await expect.poll(hasDark, { timeout: 10000 }).toBe(started) // restored, no pollution
        })
    })
})