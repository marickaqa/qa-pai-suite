import { test, expect } from '@playwright/test'

// Foundation guard — NOT a product-feature test. It proves the saved session
// (reports/saas-session.json, written by global-setup) is valid and lands on
// the right org. If the login ever rots — expired session, drifted org-picker
// markup, wrong host — this fails first and loudly, instead of every feature
// spec failing later in a confusing pile.
test.describe('SaaS session foundation', () => {
  test('saved session is authenticated and on noctocode.dev', async ({ page }) => {
    // baseURL (SAAS_URL) + storageState come from playwright.config.ts.
    await page.goto('/dashboard/overview')

    // Authenticated: not bounced back to the login page.
    await expect(page).not.toHaveURL(/login/)

    // Right org: the picker reads noctocode.dev — the same anchor global-setup
    // uses to confirm the switch stuck.
    const orgTrigger = page.locator('button:has(svg.lucide-chevrons-up-down)')
    await expect(orgTrigger).toBeVisible()
    await expect(orgTrigger).toContainText('noctocode.dev')
  })
})