import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePolicy, PolicyError, deepMerge } from '../src/index.mjs';

const NOW = new Date('2026-10-25T12:00:00Z');
const resolve = (overrides) => resolvePolicy({ overrides, now: NOW }).policy;
const problemsOf = (overrides) => {
  try {
    resolve(overrides);
    return [];
  } catch (error) {
    assert.ok(error instanceof PolicyError);
    return error.problems;
  }
};

test('defaults resolve without a team file', () => {
  const policy = resolve({});
  assert.equal(policy.testQuality.maxRetries, 2);
  assert.equal(policy.security.vulnerabilities.failOn, 'high');
});

test('teams can tune values within bounds', () => {
  const policy = resolve({ team: 'payments', testQuality: { maxRetries: 1, flakeRateBudgetPct: 1 } });
  assert.equal(policy.team, 'payments');
  assert.equal(policy.testQuality.maxRetries, 1);
  assert.equal(policy.testQuality.quarantine.maxDays, 30, 'untouched siblings keep defaults');
});

test('out-of-bounds values are rejected', () => {
  assert.match(problemsOf({ testQuality: { maxRetries: 5 } }).join(), /testQuality\.maxRetries/);
  assert.match(problemsOf({ codeQuality: { maxWarnings: 500 } }).join(), /codeQuality\.maxWarnings/);
});

test('unknown keys are rejected so typos fail loudly', () => {
  assert.match(problemsOf({ testQuality: { maxRetry: 1 } }).join(), /maxRetry/);
});

test('hard floors cannot be overridden, even to the same value', () => {
  assert.match(problemsOf({ security: { secretScanning: true } }).join(), /hard floor/);
  assert.match(problemsOf({ codeQuality: { lintErrors: 'warn' } }).join(), /codeQuality\.lintErrors/);
  assert.match(problemsOf({ security: { licenses: { allow: ['GPL-3.0'] } } }).join(), /hard floor/);
});

test('copyleft licences cannot be added', () => {
  assert.match(problemsOf({ security: { licenses: { additionalAllow: ['AGPL-3.0-only'] } } }).join(), /deny list/);
  assert.deepEqual(problemsOf({ security: { licenses: { additionalAllow: ['MPL-2.0'] } } }), []);
});

test('vulnerability ignores need a near-term expiry', () => {
  const ignore = (expires) => ({
    security: { vulnerabilities: { ignore: [{ id: 'GHSA-aaaa-bbbb-cccc', reason: 'no fix upstream yet', expires }] } },
  });
  assert.deepEqual(problemsOf(ignore('2026-12-01')), []);
  assert.match(problemsOf(ignore('2026-10-01')).join(), /expired/);
  assert.match(problemsOf(ignore('2027-06-01')).join(), /more than 90 days/);
});

test('DAST requires an authorised target', () => {
  const dast = (d) => ({ security: { dast: { enabled: true, ...d } } });
  assert.match(problemsOf(dast({})).join(), /targetUrl is required/);
  assert.match(problemsOf(dast({ targetUrl: 'https://www.saucedemo.com' })).join(), /not in authorizedHosts/);
  assert.deepEqual(
    problemsOf(dast({ targetUrl: 'https://qa.acme.internal', authorizedHosts: ['qa.acme.internal'] })),
    [],
  );
});

test('deepMerge replaces arrays and merges objects', () => {
  assert.deepEqual(deepMerge({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { d: 3 } }), { a: [3], b: { c: 1, d: 3 } });
});
