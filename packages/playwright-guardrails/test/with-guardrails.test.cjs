'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { withGuardrails, quarantine } = require('../index.cjs');

const ENV_KEYS = ['CI', 'GUARDRAILS_MAX_RETRIES', 'GUARDRAILS_QUARANTINE', 'GUARDRAILS_QUARANTINE_TAG'];
beforeEach(() => ENV_KEYS.forEach((k) => delete process.env[k]));

test('caps retries at the policy maximum and forbids only in CI', () => {
  process.env.CI = 'true';
  process.env.GUARDRAILS_MAX_RETRIES = '1';
  const config = withGuardrails({ retries: 3 });
  assert.equal(config.retries, 1);
  assert.equal(config.forbidOnly, true);
});

test('adds a JSON report and keeps existing reporters', () => {
  const config = withGuardrails({ reporter: [['html', { open: 'never' }]] }, { name: 'bookstore' });
  assert.deepEqual(config.reporter, [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/guardrails/bookstore.json' }],
  ]);
});

test('excludes quarantined tests by default and can run them alone', () => {
  const excluded = withGuardrails({ grepInvert: /@slow/ });
  assert.equal(excluded.grepInvert.length, 2);
  assert.ok(excluded.grepInvert[1].test('@quarantine flaky'));

  process.env.GUARDRAILS_QUARANTINE = 'only';
  const only = withGuardrails({});
  assert.ok(only.grep.test('@quarantine flaky'));
  assert.equal(only.grepInvert, undefined);
});

test('quarantine() builds details the gate understands', () => {
  assert.deepEqual(quarantine('QA-1', '2026-11-30', 'race'), {
    tag: '@quarantine',
    annotation: { type: 'quarantine', description: 'QA-1 until=2026-11-30 - race' },
  });
});
