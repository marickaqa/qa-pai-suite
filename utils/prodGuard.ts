// Production safety interlock.
//
// This suite logs in and (soon) creates/deletes real resources. Pointing it at
// production by accident — a stale .env, a copied prod URL — must fail
// immediately, before any login or test runs.
//
// DESIGN: this is an ALLOWLIST, not a denylist. We refuse to run unless every
// configured target URL points at a known dev/test host. A denylist fails OPEN
// (any prod host not on the list slips through); an allowlist fails SAFE
// (anything unrecognised stops the run loudly). For a guard gating destructive
// tests, failing safe is the only correct direction.
//
// Cost of this design: every new dev/test domain must be added to
// ALLOWED_DEV_HOSTNAMES below, or the suite refuses to run against it. That's a
// one-line change with a clear error — the intended price of failing safe.

// Hosts it is SAFE to run against. Everything else is refused.
// Add new dev/test domains here as the suite expands to more products.
const ALLOWED_DEV_HOSTNAMES = [
  // SaaS platform (PAI Cloud) — dev
  'chat-dev.paicloud.ai',
  // Local development
  'localhost',
  '127.0.0.1',
]

// Every env var that can point the suite at a target environment.
// Must stay exhaustive: a URL-bearing var NOT listed here is never checked.
const URL_ENV_VARS = ['SAAS_URL']

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Throws unless every configured target URL points at a known dev/test host.
 * Call at the very top of global setup, before any login or token fetch.
 *
 * A set-but-unparseable value (e.g. missing its https:// scheme) is treated as
 * an offender, not skipped — a malformed prod URL must not slip through.
 * Unset vars are ignored here; requiring a var to be present is the config's
 * job (see required() in playwright.config.ts), not the guard's.
 */
export function assertNotProd(): void {
  const offenders: string[] = []

  for (const name of URL_ENV_VARS) {
    const value = process.env[name]
    if (!value) continue // unset = not a target; not the guard's concern
    const host = hostnameOf(value)
    if (host === null) {
      offenders.push(`${name}=${value} (could not parse a hostname — is the scheme missing?)`)
      continue
    }
    if (!ALLOWED_DEV_HOSTNAMES.includes(host)) {
      offenders.push(`${name}=${value} (host "${host}" is not an allowed dev/test host)`)
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      [
        'PRODUCTION GUARD: refusing to run — these target URLs are not known dev/test hosts:',
        ...offenders.map((o) => `   ${o}`),
        '',
        'This suite creates and deletes real resources. Point these at dev',
        '(see .env.example). If a new dev/test domain is legitimate, add its',
        'hostname to ALLOWED_DEV_HOSTNAMES in utils/prodGuard.ts.',
      ].join('\n')
    )
  }
}