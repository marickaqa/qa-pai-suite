import { test, expect, type Page } from '@playwright/test'
import { forceOrg } from '../../../../utils/saasOrg'

/**
 * saas-conversations.spec.ts — Inbox / Conversations (/dashboard/conversations).
 *
 * PASS 1 (this): the landing surface — list loads in the right org; status
 * filter, bot pills, and search render. Read-only, no bot selected.
 *
 * PASS 2 (next): select a bot, view conversations + detail, and the handoff
 * surface — STRICTLY READ-ONLY. Two irreversible actions are never triggered:
 *   - never click "Enable Handoff" (one-way, no undo)
 *   - never click "Send" (filling the composer proves the channel; sending posts)
 *
 * Shared session (noctocode.dev). Nav settles the org at /dashboard/overview
 * first to avoid the cold-boot-on-wrong-org race.
 */

const orgTrigger = (page: Page) =>
    page.locator('button:has(svg.lucide-chevrons-up-down)')

async function gotoConversations(page: Page) {
  await forceOrg(page)
  await page.goto('/dashboard/conversations')
}

test.describe('Core — SaaS Conversations (landing)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoConversations(page)
    })

    test('loads the conversations page in the right org', async ({ page }) => {
        // Confident anchor — no guessed selectors. Proves authenticated, on the
        // conversations route, still in noctocode.dev.
        expect(page.url()).toContain('/dashboard/conversations')
        await expect(orgTrigger(page)).toContainText(/noctocode\.dev/i)
    })

    // ---- flagged: selectors from the old post-redesign spec, verified by run ----

    test('shows the status filter', async ({ page }) => {
        await expect(
            page.getByRole('button', { name: /filter chats by status/i })
        ).toBeVisible({ timeout: 15000 })
    })

    test('shows a non-negative conversation count in the status filter', async ({ page }) => {
        const filter = page.getByRole('button', { name: /filter chats by status/i })
        await expect(filter).toBeVisible({ timeout: 15000 })
        const badge = await filter.getByText(/^\d+$/).first().textContent()
        expect(Number(badge)).toBeGreaterThanOrEqual(0)
    })

    test('shows support-bot filter pills', async ({ page }) => {
        // noctocode.dev bots per the dashboard: telaris, marija test, MMV support bot.
        await expect(page.getByRole('button', { name: 'telaris', exact: true })).toBeVisible({ timeout: 15000 })
    })

    test('shows the chat search input', async ({ page }) => {
        await expect(page.getByPlaceholder(/search chats/i)).toBeVisible({ timeout: 15000 })
    })
    test.describe('Core — SaaS Conversations (detail — read-only)', () => {
        const TEST_BOT = 'marija test'

        // Conversation rows are buttons carrying a "Chat session" subtitle.
        const rows = (page: Page) =>
            page.locator('button').filter({ hasText: 'Chat session' })

        // Select a bot → its conversations load and the top one opens.
        async function openBot(page: Page, name: string) {
            const pill = page.getByRole('button', { name, exact: true })
            await expect(pill).toBeVisible({ timeout: 15000 })
            await pill.click()
            await expect(rows(page).first()).toBeVisible({ timeout: 15000 })
        }

        test.beforeEach(async ({ page }) => {
            await gotoConversations(page)
            await expect(page.getByRole('button', { name: /filter chats by status/i }))
                .toBeVisible({ timeout: 15000 })
        })

        test('shows conversation rows once a bot is selected', async ({ page }) => {
            await openBot(page, TEST_BOT)
            // Wait for the list to hydrate before counting (poll, don't snapshot).
            await expect.poll(async () => rows(page).count(), { timeout: 15000 })
                .toBeGreaterThan(0)
        })

        test('opens the top conversation and shows its session header', async ({ page }) => {
            await openBot(page, TEST_BOT)
            // Detail panel populated: the session header shows "Started ...".
            await expect(page.getByText(/Started/i).first()).toBeVisible({ timeout: 15000 })
        })

        test('shows the Enable Handoff control on a non-handed-off conversation', async ({ page }) => {
            await openBot(page, TEST_BOT)
            // Open a row that is neither handed off nor deleted. NOT clicked — the
            // control is inspected only; enabling handoff is irreversible.
            const fresh = rows(page)
                .filter({ hasNotText: 'Handoff' })
                .filter({ hasNotText: 'Deleted' })
                .first()
            await expect(fresh, 'no non-handed-off conversation to inspect').toBeVisible({ timeout: 15000 })
            await fresh.click()
            await expect(page.getByRole('button', { name: /enable handoff/i }))
                .toBeVisible({ timeout: 15000 })
        })

        test('reply composer goes live on an already-handed-off conversation', async ({ page }) => {
            await openBot(page, TEST_BOT)

            // Needs a conversation ALREADY in handoff — we're forbidden from creating one.
            // If none exists, skip honestly rather than fake it.
            const handedOff = rows(page)
                .filter({ has: page.getByText('Handoff', { exact: true }) })
                .filter({ hasNotText: 'Deleted' })
                .first()
            const available = await handedOff.isVisible().catch(() => false)
            test.skip(!available, 'no already-handed-off conversation in this fixture to inspect')

            await handedOff.click()

            // Composer active: Send is disabled until text, enabled after. We fill to
            // prove the channel is live, then STOP — never click Send (would post).
            const reply = page.getByPlaceholder(/^Reply\b/i)
            await expect(reply).toBeVisible({ timeout: 15000 })
            const send = page.getByRole('button', { name: 'Send' })
            await expect(send).toBeDisabled()
            await reply.fill('handoff reply channel check')
            await expect(send).toBeEnabled()
            // Deliberately never click Send.
        })
    })
})