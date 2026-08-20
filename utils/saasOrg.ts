import { expect, type Page } from '@playwright/test'

const orgTrigger = (page: Page) =>
  page.locator('button:has(svg.lucide-chevrons-up-down)')

/**
 * Force the active org to noctocode.dev, then navigate.
 *
 * Guards the two ways the SaaS SPA isn't ready when we act:
 *   1. the authenticated shell (org trigger) not rendering on first load — a
 *      slow/misrouted boot; we reload once before giving up;
 *   2. a full-viewport boot/transition overlay intercepting the org click;
 *   3. the org dropdown rows not being rendered the instant the menu opens.
 */
export async function forceOrg(page: Page, target = /noctocode\.dev/i) {
  await page.goto('/dashboard/overview')

  const trigger = orgTrigger(page)
  // (1) Reload once if the shell didn't render, so this isn't intermittent flake
  // in every caller.
  try {
    await expect(trigger).toBeVisible({ timeout: 20000 })
  } catch {
    await page.reload()
    await expect(trigger).toBeVisible({ timeout: 20000 })
  }

  // (2) Wait for any click-blocking full-screen overlay to detach.
  await settleOverlays(page)

  if (target.test((await trigger.textContent()) || '')) return // already on target

  await trigger.click()

  // (3) The dropdown must actually render its rows before we look for the org.
  await expect(
    page.getByText(/trump media/i).or(page.getByText(target)).first(),
    'org dropdown did not populate its rows'
  ).toBeVisible({ timeout: 15000 })

  // Click the target row — the match that is NOT inside the trigger button.
  const matches = page.getByText(target)
  await expect(matches.first(), 'target org not found in the open picker').toBeVisible({ timeout: 10000 })
  const n = await matches.count()
  for (let i = 0; i < n; i++) {
    const cand = matches.nth(i)
    const inTrigger = await cand
      .locator('xpath=ancestor::button[.//svg[contains(@class,"lucide-chevrons-up-down")]]')
      .count()
    if (inTrigger === 0) {
      await cand.click()
      break
    }
  }

  await expect(trigger).toContainText(target, { timeout: 15000 })
}

/**
 * Wait for click-intercepting full-screen overlays to detach. Tolerates none.
 */
async function settleOverlays(page: Page) {
  const overlay = page.locator(
    'div.pointer-events-auto.absolute.inset-0, div.pointer-events-auto.min-h-screen'
  )
  if ((await overlay.count().catch(() => 0)) > 0) {
    await overlay.first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  }
}

/** Force org, then go to a dashboard path (relative to baseURL). */
export async function gotoSaasOrgScoped(page: Page, path: string) {
  await forceOrg(page)
  await page.goto(path)
}