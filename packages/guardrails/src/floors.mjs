/**
 * Hard floors: settings no team may weaken. Changing one is reported with a
 * pointer to the governance process rather than a raw schema error.
 */
export const LOCKED_KEYS = [
  'codeQuality.typecheck',
  'codeQuality.lintErrors',
  'security.secretScanning',
  'security.vulnerabilities.blockCritical',
  // the central licence list is owned by Legal; teams extend via additionalAllow
  'security.licenses.allow',
];

/** Licences a team can never add via `additionalAllow` (copyleft / source-available). */
export const DENIED_LICENSES = [/^A?GPL/i, /^LGPL/i, /^SSPL/i, /^BUSL/i, /^EUPL/i, /^CC-BY-NC/i, /^Commons-Clause/i];

export const MAX_IGNORE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function get(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * @param {Record<string, unknown>} overrides raw team file (pre-merge)
 * @param {import('./policy.mjs').Policy} policy merged + schema-validated policy
 * @param {Date} now
 * @returns {string[]} human readable violations, empty when compliant
 */
export function checkFloors(overrides, policy, now = new Date()) {
  const violations = [];

  for (const key of LOCKED_KEYS) {
    if (get(overrides, key) !== undefined) {
      violations.push(`${key} is a hard floor and cannot be overridden (raise a governance exception instead)`);
    }
  }

  for (const licence of policy.security.licenses.additionalAllow) {
    if (DENIED_LICENSES.some((re) => re.test(licence))) {
      violations.push(`security.licenses.additionalAllow: ${licence} is on the enterprise deny list`);
    }
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const ignore of policy.security.vulnerabilities.ignore) {
    const expires = Date.parse(`${ignore.expires}T00:00:00Z`);
    if (Number.isNaN(expires)) {
      violations.push(`security.vulnerabilities.ignore[${ignore.id}]: invalid expiry ${ignore.expires}`);
    } else if (expires < today) {
      violations.push(`security.vulnerabilities.ignore[${ignore.id}]: expired on ${ignore.expires} - fix or renew`);
    } else if (expires - today > MAX_IGNORE_DAYS * DAY_MS) {
      violations.push(
        `security.vulnerabilities.ignore[${ignore.id}]: expiry ${ignore.expires} is more than ${MAX_IGNORE_DAYS} days out`,
      );
    }
  }

  const { dast } = policy.security;
  if (dast.enabled) {
    if (!dast.targetUrl) {
      violations.push('security.dast.targetUrl is required when DAST is enabled');
    } else if (!dast.authorizedHosts.includes(new URL(dast.targetUrl).hostname)) {
      violations.push(
        `security.dast: ${new URL(dast.targetUrl).hostname} is not in authorizedHosts - only scan systems you own or are authorised to test`,
      );
    }
  }

  const patterns = {
    'testQuality.quarantine.ticketPattern': [policy.testQuality.quarantine.ticketPattern],
    'testQuality.assertFunctionPatterns': policy.testQuality.assertFunctionPatterns,
  };
  for (const [key, list] of Object.entries(patterns)) {
    for (const pattern of list) {
      try {
        new RegExp(pattern);
      } catch {
        violations.push(`${key}: "${pattern}" is not a valid regular expression`);
      }
    }
  }

  return violations;
}
