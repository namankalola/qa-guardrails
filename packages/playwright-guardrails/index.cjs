'use strict';

const DEFAULT_MAX_RETRIES = 2;

function intFromEnv(name, min, max, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : Math.min(Math.max(value, min), max);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toReporterList(reporter) {
  if (!reporter) return [['list']];
  if (typeof reporter === 'string') return [[reporter]];
  return reporter.map((r) => (typeof r === 'string' ? [r] : r));
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Wrap a Playwright config with the enterprise test-quality guardrails:
 *
 *  - `forbidOnly` in CI (a stray `test.only` never ships)
 *  - retries capped at the policy maximum (GUARDRAILS_MAX_RETRIES, set by CI from guardrails.config.yml)
 *  - a JSON report per config for the flake-rate and quarantine gates
 *  - quarantined tests excluded from blocking runs (GUARDRAILS_QUARANTINE=exclude|only|include)
 *  - traces kept for failures
 *
 * @template {import('@playwright/test').PlaywrightTestConfig} T
 * @param {T} config
 * @param {{ name?: string, reportDir?: string }} [options]
 * @returns {T}
 */
function withGuardrails(config, options = {}) {
  const { name = 'default', reportDir = 'reports/guardrails' } = options;
  const isCI = Boolean(process.env.CI);
  const maxRetries = intFromEnv('GUARDRAILS_MAX_RETRIES', 0, DEFAULT_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const quarantineTag = process.env.GUARDRAILS_QUARANTINE_TAG || '@quarantine';
  const quarantineMode = process.env.GUARDRAILS_QUARANTINE || 'exclude';
  const quarantinePattern = new RegExp(`${escapeRegExp(quarantineTag)}\\b`);

  const requestedRetries = config.retries ?? 0;
  if (requestedRetries > maxRetries) {
    console.warn(`[guardrails] retries=${requestedRetries} exceeds the policy maximum of ${maxRetries}; capping.`);
  }

  const reporter = toReporterList(config.reporter);
  if (!reporter.some(([r]) => r === 'json')) {
    reporter.push(['json', { outputFile: `${reportDir}/${name}.json` }]);
  }
  if (isCI && !reporter.some(([r]) => r === 'github')) reporter.push(['github']);

  const guarded = {
    ...config,
    forbidOnly: isCI ? true : config.forbidOnly,
    retries: Math.min(requestedRetries, maxRetries),
    reporter,
    use: { trace: 'retain-on-failure', ...config.use },
  };

  if (quarantineMode === 'only') {
    guarded.grep = quarantinePattern;
  } else if (quarantineMode !== 'include') {
    guarded.grepInvert = [...toArray(config.grepInvert), quarantinePattern];
  }

  return guarded;
}

/**
 * Test details for a quarantined test, in the shape the quarantine gate checks:
 *
 *   test('flaky thing', quarantine('QA-123', '2026-11-30', 'race on cart badge'), async () => { ... });
 *
 * @param {string} ticket owning ticket, e.g. "QA-123"
 * @param {string} until expiry date, YYYY-MM-DD (within testQuality.quarantine.maxDays)
 * @param {string} [reason]
 */
function quarantine(ticket, until, reason) {
  return {
    tag: process.env.GUARDRAILS_QUARANTINE_TAG || '@quarantine',
    annotation: { type: 'quarantine', description: `${ticket} until=${until}${reason ? ` - ${reason}` : ''}` },
  };
}

module.exports = { withGuardrails, quarantine };
