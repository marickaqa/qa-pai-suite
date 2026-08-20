import { test, expect, type Page } from '@playwright/test'

/**
 * saas-auth.spec.ts — authentication surface.
 *
 * Login + signup/enumeration + logout run UNAUTHENTICATED (empty storageState).
 * Org-picker read runs on the shared session. Org-switch runs on a THROWAWAY
 * session so a mid-switch failure can never strand reports/saas-session.json.
 */

const emailInput = (page: Page) => page.locator('input[name="email"]')
const passwordInput = (page: Page) => page.locator('input[name="password"]')
const submitButton = (page: Page) => page.locator('button[type="submit"]')
const orgTrigger = (page: Page) =>
    page.locator('button:has(svg.lucide-chevrons-up-down)')

// Fresh login in whatever context calls it. Returns once authenticated.
async function loginFresh(page: Page) {
    await page.goto('/login')
    await emailInput(page).fill(process.env.SAAS_EMAIL || '')
    await passwordInput(page).fill(process.env.SAAS_PASSWORD || '')
    await submitButton(page).click()
    await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30000 })
}

test.describe('Core — SaaS Auth (login page)', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test.beforeEach(async ({ page }) => {
        await page.goto('/login')
        await expect(emailInput(page)).toBeVisible({ timeout: 20000 })
    })

    test('shows the sign-in form', async ({ page }) => {
        await expect(emailInput(page)).toBeVisible()
        await expect(passwordInput(page)).toBeVisible()
        await expect(submitButton(page)).toBeVisible()
    })

    test('signs in with valid credentials and leaves /login', async ({ page }) => {
        await emailInput(page).fill(process.env.SAAS_EMAIL || '')
        await passwordInput(page).fill(process.env.SAAS_PASSWORD || '')
        await submitButton(page).click()
        await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30000 })
        expect(page.url()).not.toContain('login')
    })

    test('rejects a wrong password and stays on /login with an error', async ({ page }) => {
        await emailInput(page).fill(process.env.SAAS_EMAIL || '')
        await passwordInput(page).fill('DefinitelyWrong-999!')
        await submitButton(page).click()
        await expect(page).toHaveURL(/login/)
        const error = page
            .getByRole('alert')
            .or(page.getByText(/invalid|incorrect|wrong|do(?:es)?n.?t match|try again/i))
        await expect(error.first()).toBeVisible({ timeout: 10000 })
    })

    test('does not authenticate with an empty email', async ({ page }) => {
        await emailInput(page).fill('')
        await passwordInput(page).fill(process.env.SAAS_PASSWORD || '')
        await submitButton(page).click()
        await expect(page).toHaveURL(/login/)
        await expect(emailInput(page)).toBeVisible()
    })

    test('does not authenticate with an empty password', async ({ page }) => {
        await emailInput(page).fill(process.env.SAAS_EMAIL || '')
        await passwordInput(page).fill('')
        await submitButton(page).click()
        await expect(page).toHaveURL(/login/)
        await expect(passwordInput(page)).toBeVisible()
    })

    test('offers a link to create an account', async ({ page }) => {
        await expect(page.getByRole('link', { name: /create an account|sign up/i })).toBeVisible()
    })

    test('offers a forgot-password link', async ({ page }) => {
        await expect(page.getByText(/forgot password/i)).toBeVisible()
    })

    test('renders the Google OAuth button wired to its auth endpoint', async ({ page }) => {
        const google = page.getByRole('link', { name: /google/i })
        await expect(google).toBeVisible()
        await expect(google).toHaveAttribute('href', /google/i)
    })
})

test.describe('Core — SaaS Auth (signup + enumeration)', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    const signupSubmit = (page: Page) =>
        page.getByRole('button', { name: /sign up|create account|get started/i })

    test.beforeEach(async ({ page }) => {
        await page.goto('/signup')
        await expect(emailInput(page)).toBeVisible({ timeout: 20000 })
    })

    test('shows the sign-up form', async ({ page }) => {
        await expect(emailInput(page)).toBeVisible()
        await expect(passwordInput(page)).toBeVisible()
        await expect(signupSubmit(page)).toBeVisible()
    })

    test('offers a link back to sign in', async ({ page }) => {
        await expect(page.getByRole('link', { name: /sign in|log in|login/i })).toBeVisible()
    })

    test('reaches signup from the login page via "Create an account"', async ({ page }) => {
        await page.goto('/login')
        await expect(emailInput(page)).toBeVisible()
        await page.getByRole('link', { name: /create an account|sign up/i }).click()
        await expect(page).toHaveURL(/signup/)
    })

    test('does not submit signup with empty fields', async ({ page }) => {
        await signupSubmit(page).click()
        await expect(page).toHaveURL(/signup/)
    })

    test('does not reveal whether an email is already registered', async ({ page }) => {
        await emailInput(page).fill(process.env.SAAS_EMAIL || '')
        await passwordInput(page).fill('Password123!')
        await signupSubmit(page).click()

        const confirmation = page
            .getByText(/check your email|verification link|confirm your email|we sent/i)
            .first()
        const existsError = page
            .getByText(/already (exists|registered|taken|in use)|account exists/i)
            .first()

        await expect(confirmation.or(existsError)).toBeVisible({ timeout: 15000 })
        await expect(
            existsError,
            'signup revealed the email already exists — enumeration leak'
        ).toHaveCount(0)
        await expect(confirmation).toBeVisible()
    })
})

test.describe('Core — SaaS Auth (logout)', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    async function loginAndSettle(page: Page) {
        // Dedicated throwaway account — NOT the shared SAAS_EMAIL. Logging this one
        // out invalidates only its own token, never the shared session file's token
        // that every later spec depends on.
        const email = process.env.SAAS_LOGOUT_EMAIL
        const password = process.env.SAAS_LOGOUT_PASSWORD
        test.skip(!email || !password, 'SAAS_LOGOUT_EMAIL/PASSWORD not set')

        await page.goto('/login')
        await page.locator('input[name="email"]').fill(email!)
        await page.locator('input[name="password"]').fill(password!)
        await page.locator('button[type="submit"]').click()
        await page.waitForURL((url) => !url.toString().includes('login'), { timeout: 30000 })
        await expect(page.getByRole('button', { name: /log out/i })).toBeVisible({ timeout: 30000 })
    }

    test('cancelling the logout dialog keeps the session', async ({ page }) => {
        await loginAndSettle(page)
        await page.getByRole('button', { name: /log out/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /cancel/i }).click()
        await expect(dialog).toBeHidden()
        await expect(page.getByRole('button', { name: /log out/i })).toBeVisible()
        expect(page.url()).not.toContain('login')
    })

    test('confirming the logout dialog ends the session', async ({ page }) => {
        await loginAndSettle(page)
        await page.getByRole('button', { name: /log out/i }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: /^logout$/i }).click()
        await expect(page.getByRole('button', { name: /log out/i })).toHaveCount(0, { timeout: 20000 })
    })
})

test.describe('Core — SaaS Auth (org picker)', () => {
    // Shared session — reads only, changes nothing.
    test('shows the org picker with the active org', async ({ page }) => {
        await page.goto('/dashboard/overview')
        await expect(orgTrigger(page)).toBeVisible({ timeout: 30000 })
        // global-setup repoints the saved session to noctocode.dev; this guards the
        // repoint holds across a fresh load (auto-retries through the boot flicker).
        await expect(orgTrigger(page)).toContainText(/noctocode\.dev/i)
    })
})

test.describe('Core — SaaS Auth (org switch)', () => {
    // THROWAWAY session — switching mutates server-side org state, so we never do
    // it on the shared session. global-setup re-forces noctocode.dev every run, so
    // whatever this leaves the account on can't poison later runs either.
    test.use({ storageState: { cookies: [], origins: [] } })

    test('switches the active organization via the picker', async ({ page }) => {
        await loginFresh(page)
        const trigger = orgTrigger(page)
        await expect(trigger).toBeVisible({ timeout: 30000 })

        const current = (await trigger.textContent()) || ''
        const goToNocto = !/noctocode\.dev/i.test(current)
        const target = goToNocto ? /noctocode\.dev/i : /trump media/i

        await trigger.click()

        // The trigger shows the active org name too, so the same text appears twice
        // once the menu opens. Grab ALL matches, then click the one that is NOT the
        // trigger (the dropdown row lives outside the trigger button).
        const allMatches = page.getByText(target)
        await expect(allMatches.first()).toBeVisible({ timeout: 10000 })

        const count = await allMatches.count()
        let clicked = false
        for (let i = 0; i < count; i++) {
            const candidate = allMatches.nth(i)
            // Skip the one inside the org-picker trigger button.
            const insideTrigger = await candidate
                .locator('xpath=ancestor::button[.//svg[contains(@class,"lucide-chevrons-up-down")]]')
                .count()
            if (insideTrigger === 0) {
                await candidate.click()
                clicked = true
                break
            }
        }
        expect(clicked, 'no dropdown row for the target org (only the trigger matched)').toBe(true)

        await expect(trigger).toContainText(target, { timeout: 15000 })
    })
})