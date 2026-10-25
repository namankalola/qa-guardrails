import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadDefaults } from '../src/policy.mjs';
import { parseAudit, evaluateAudit } from '../src/gates/audit.mjs';
import { collectPackages, evaluateLicenses, isLicenseAllowed } from '../src/gates/licenses.mjs';
import { collectFromReports } from '../src/gates/playwright-report.mjs';
import { evaluateQuarantine } from '../src/gates/quarantine.mjs';
import { evaluateFlakes } from '../src/gates/flake.mjs';
import { findUnpinned } from '../src/gates/pinned-actions.mjs';

const defaults = loadDefaults();
const NOW = new Date('2026-10-25T12:00:00Z');

test('audit: npm v2 and pnpm reports normalise to the same findings', () => {
  const npm = {
    auditReportVersion: 2,
    vulnerabilities: {
      axios: {
        name: 'axios',
        severity: 'high',
        via: [
          {
            source: 1,
            name: 'axios',
            title: 'SSRF',
            url: 'https://github.com/advisories/GHSA-1111-2222-3333',
            severity: 'high',
          },
        ],
      },
      wrapper: { name: 'wrapper', severity: 'high', via: ['axios'] },
    },
  };
  const pnpm = {
    advisories: {
      1: { module_name: 'axios', severity: 'high', title: 'SSRF', github_advisory_id: 'GHSA-1111-2222-3333', url: '' },
    },
  };
  assert.deepEqual(
    parseAudit(npm).map((f) => f.id),
    ['GHSA-1111-2222-3333'],
  );
  assert.deepEqual(
    parseAudit(pnpm).map((f) => f.id),
    ['GHSA-1111-2222-3333'],
  );
});

test('audit: threshold, ignores, and the critical floor', () => {
  const findings = [
    { id: 'GHSA-high', package: 'a', severity: 'high', title: '', url: '' },
    { id: 'GHSA-mod', package: 'b', severity: 'moderate', title: '', url: '' },
    { id: 'GHSA-crit', package: 'c', severity: 'critical', title: '', url: '' },
  ];
  const policy = { failOn: 'high', ignore: [{ id: 'GHSA-high' }, { id: 'GHSA-crit' }] };
  const result = evaluateAudit(findings, policy);
  assert.deepEqual(
    result.blocking.map((f) => f.id),
    ['GHSA-crit'],
    'critical blocks even when ignored',
  );
  assert.deepEqual(
    result.ignored.map((f) => f.id),
    ['GHSA-high'],
  );
  assert.deepEqual(
    result.belowThreshold.map((f) => f.id),
    ['GHSA-mod'],
  );
  assert.equal(result.ignoredCriticalAttempts.length, 1);
});

test('licenses: SPDX expressions', () => {
  const allowed = new Set(['MIT', 'Apache-2.0']);
  assert.ok(isLicenseAllowed('MIT', allowed));
  assert.ok(isLicenseAllowed('(MIT OR GPL-3.0)', allowed));
  assert.ok(!isLicenseAllowed('MIT AND GPL-3.0', allowed));
  assert.ok(isLicenseAllowed('Apache-2.0 WITH LLVM-exception', allowed));
  assert.ok(!isLicenseAllowed('', allowed));
  assert.ok(isLicenseAllowed('MIT/X11', allowed), 'legacy spellings are normalised');
});

test('licenses: walks npm nested and pnpm store layouts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lic-'));
  const pkg = (dir, manifest) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  };
  const nm = path.join(root, 'node_modules');
  pkg(path.join(nm, 'ok'), { name: 'ok', version: '1.0.0', license: 'MIT' });
  pkg(path.join(nm, 'ok', 'node_modules', 'nested'), { name: 'nested', version: '1.0.0', license: { type: 'ISC' } });
  pkg(path.join(nm, '@scope', 'gpl'), { name: '@scope/gpl', version: '2.0.0', license: 'GPL-3.0' });
  pkg(path.join(nm, '.pnpm', 'store@1.0.0', 'node_modules', 'store'), {
    name: 'store',
    version: '1.0.0',
    licenses: [{ type: 'BSD-3-Clause' }],
  });
  pkg(path.join(nm, '@ariseqa', 'internal'), { name: '@ariseqa/internal', version: '1.0.0', license: 'UNLICENSED' });

  const packages = collectPackages(nm);
  assert.equal(packages.length, 5);
  const { violations } = evaluateLicenses(packages, defaults.security.licenses);
  assert.deepEqual(
    violations.map((v) => v.name),
    ['@scope/gpl'],
  );
  const excepted = evaluateLicenses(packages, {
    ...defaults.security.licenses,
    exceptions: [{ package: '@scope/gpl', reason: 'dev-only tool, legal OK' }],
  });
  assert.equal(excepted.violations.length, 0);
});

/** Minimal Playwright JSON report builder. */
const report = (specs) => ({
  suites: [
    {
      title: 'a.spec.ts',
      file: 'a.spec.ts',
      specs: specs.map((s, i) => ({
        title: s.title,
        file: 'a.spec.ts',
        line: i + 1,
        tags: s.tags ?? [],
        tests: s.tests,
      })),
    },
  ],
});

test('quarantine: requires ticket + expiry, caps share, requires skip reasons', () => {
  const tests = collectFromReports([
    report([
      {
        title: 'good',
        tags: ['quarantine'],
        tests: [{ annotations: [{ type: 'quarantine', description: 'QA-1 until=2026-11-10' }] }],
      },
      {
        title: 'no ticket',
        tags: ['quarantine'],
        tests: [{ annotations: [{ type: 'quarantine', description: 'until=2026-11-10' }] }],
      },
      {
        title: 'expired',
        tags: ['quarantine'],
        tests: [{ annotations: [{ type: 'quarantine', description: 'QA-2 until=2026-10-01' }] }],
      },
      {
        title: 'too long',
        tags: ['@quarantine'],
        tests: [{ annotations: [{ type: 'quarantine', description: 'QA-3 until=2027-03-01' }] }],
      },
      { title: 'bare skip', tags: ['smoke'], tests: [{ expectedStatus: 'skipped', annotations: [{ type: 'skip' }] }] },
      {
        title: 'skip with ticket',
        tags: ['smoke'],
        tests: [{ expectedStatus: 'skipped', annotations: [{ type: 'skip', description: 'blocked by QA-9' }] }],
      },
      {
        title: 'static skip with issue',
        tags: ['smoke'],
        tests: [
          { expectedStatus: 'skipped', annotations: [{ type: 'skip' }, { type: 'issue', description: 'QA-10' }] },
        ],
      },
      ...Array.from({ length: 3 }, (_, i) => ({ title: `plain ${i}`, tags: ['smoke'], tests: [{ annotations: [] }] })),
    ]),
  ]);
  const result = evaluateQuarantine(tests, defaults.testQuality, NOW);
  const messages = result.problems.map((p) => p.message).join('\n');
  assert.equal(result.quarantined.length, 4);
  assert.match(messages, /no ticket: quarantine annotation must reference a ticket/);
  assert.match(messages, /expired: quarantine expired/);
  assert.match(messages, /too long: .*exceeds the 30-day limit/);
  assert.match(messages, /bare skip: skipped without a ticket/);
  assert.doesNotMatch(messages, /skip with ticket/);
  assert.doesNotMatch(messages, /static skip with issue/);
  assert.doesNotMatch(messages, /^good/m);
  assert.match(messages, /4\/10 tests \(40\.0%\) are quarantined/);
});

test('flakes: rate over executed tests, merged across projects', () => {
  const tests = collectFromReports([
    report([
      {
        title: 'stable',
        tests: [
          { projectName: 'chromium', status: 'expected', results: [{}] },
          { projectName: 'firefox', status: 'expected', results: [{}] },
        ],
      },
      { title: 'flaky', tests: [{ projectName: 'chromium', status: 'flaky', results: [{}, {}] }] },
      { title: 'skipped', tests: [{ projectName: 'chromium', status: 'skipped', results: [] }] },
    ]),
  ]);
  const result = evaluateFlakes(tests, 2);
  assert.equal(result.executed, 2);
  assert.equal(result.flaky.length, 1);
  assert.equal(result.rate, 50);
  assert.ok(result.overBudget);
  assert.equal(result.flaky[0].retries, 1);
});

test('pinned-actions: flags tags/branches, accepts SHAs, local and trusted owners', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wf-'));
  writeFileSync(
    path.join(dir, 'ci.yml'),
    [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: actions/checkout@v7',
      '      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
      '      - uses: ./.github/actions/local',
      '      - uses: docker://alpine:3',
      '    uses: ariseqa/qa-guardrails/.github/workflows/guardrails.yml@v1',
    ].join('\n'),
  );
  const findings = findUnpinned([dir], ['ariseqa']);
  assert.deepEqual(
    findings.map((f) => f.ref),
    ['actions/checkout@v7', 'docker://alpine:3'],
  );
});
