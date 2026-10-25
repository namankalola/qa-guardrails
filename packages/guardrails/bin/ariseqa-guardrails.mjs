#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolvePolicy, PolicyError } from '../src/policy.mjs';
import { parseAudit, evaluateAudit } from '../src/gates/audit.mjs';
import { collectPackages, evaluateLicenses } from '../src/gates/licenses.mjs';
import { collectFromReports } from '../src/gates/playwright-report.mjs';
import { evaluateQuarantine } from '../src/gates/quarantine.mjs';
import { evaluateFlakes } from '../src/gates/flake.mjs';
import { findUnpinned } from '../src/gates/pinned-actions.mjs';
import { annotate, mdTable, setOutput, writeSummary } from '../src/report.mjs';

const USAGE = `ariseqa-guardrails <command> [options]

Commands
  validate        Resolve and validate guardrails.config.yml (writes the effective policy as output "policy")
  audit           Gate an npm/pnpm audit JSON report      --report <file>
  licenses        Gate installed dependency licences      [--node-modules <dir>]
  quarantine      Gate quarantine/skip hygiene            --report <playwright --list json>...
  flakes          Gate flake rate of a test run           --report <playwright json>... [--out <file>]
  dast-target     Print the authorised DAST target        [--target <url>]
  pinned-actions  Report actions not pinned to a SHA      [--dir <dir>]... [--trusted-owner <owner>]...

Common options
  --cwd <dir>     Repository root (default: current directory)
  --policy <file> Policy file relative to --cwd (default: guardrails.config.yml)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    cwd: { type: 'string', default: process.cwd() },
    policy: { type: 'string' },
    report: { type: 'string', multiple: true, default: [] },
    'node-modules': { type: 'string' },
    dir: { type: 'string', multiple: true, default: [] },
    'trusted-owner': { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
    target: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const readJson = (file) => {
  const full = path.resolve(values.cwd, file);
  if (!existsSync(full)) throw new GateError(`report not found: ${file} (did the previous step produce it?)`);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    throw new GateError(`report ${file} is not valid JSON: ${error.message}`);
  }
};
const rel = (file) => path.relative(values.cwd, path.resolve(values.cwd, file)).split(path.sep).join('/');

function loadPolicy() {
  return resolvePolicy({ cwd: values.cwd, file: values.policy }).policy;
}

const commands = {
  validate() {
    const { policy, source } = resolvePolicy({ cwd: values.cwd, file: values.policy });
    setOutput('policy', JSON.stringify(policy));
    writeSummary(
      `### Guardrails policy\nTeam **${policy.team}** - ${source ? `\`${rel(source)}\`` : 'enterprise defaults (no guardrails.config.yml)'}\n\n` +
        mdTable(
          ['Setting', 'Value'],
          [
            ['Lint warnings allowed', policy.codeQuality.maxWarnings],
            ['Type safety', policy.codeQuality.typeSafety],
            ['Max retries', policy.testQuality.maxRetries],
            ['Flake budget', `${policy.testQuality.flakeRateBudgetPct}%`],
            ['Vulnerabilities fail on', `${policy.security.vulnerabilities.failOn} (critical always)`],
            ['Semgrep / CodeQL', `${policy.security.sast.semgrep} / ${policy.security.sast.codeql}`],
            ['DAST', policy.security.dast.enabled ? policy.security.dast.targetUrl : 'disabled'],
            ['Container scan', policy.security.container.enabled ? policy.security.container.dockerfile : 'disabled'],
            ['Unpinned actions', policy.supplyChain.pinnedActions],
          ],
        ),
    );
    console.log(JSON.stringify(policy, null, 2));
    return 0;
  },

  audit() {
    const policy = loadPolicy();
    if (values.report.length !== 1) throw new UsageError('audit needs exactly one --report');
    const result = evaluateAudit(parseAudit(readJson(values.report[0])), policy.security.vulnerabilities);
    for (const f of result.ignoredCriticalAttempts) {
      annotate('error', `${f.id} (${f.package}) is critical - critical advisories cannot be ignored`);
    }
    for (const f of result.blocking)
      annotate('error', `${f.severity.toUpperCase()} ${f.id} in ${f.package}: ${f.title}`);
    writeSummary(
      `### Dependency vulnerabilities\nThreshold: **${policy.security.vulnerabilities.failOn}** (critical always blocks) - ` +
        `${result.blocking.length} blocking, ${result.ignored.length} ignored, ${result.belowThreshold.length} below threshold\n\n` +
        (result.blocking.length
          ? mdTable(
              ['Severity', 'Advisory', 'Package', 'Title'],
              result.blocking.map((f) => [f.severity, f.url || f.id, f.package, f.title]),
            )
          : ''),
    );
    return result.blocking.length > 0 ? 1 : 0;
  },

  licenses() {
    const policy = loadPolicy();
    const nodeModules = path.resolve(values.cwd, values['node-modules'] ?? 'node_modules');
    const { scanned, violations } = evaluateLicenses(collectPackages(nodeModules), policy.security.licenses);
    for (const v of violations)
      annotate('error', `${v.name}@${v.version} has licence "${v.license || 'none declared'}" which is not allowed`);
    writeSummary(
      `### Dependency licences\n${scanned} packages scanned, ${violations.length} not on the allow list\n\n` +
        (violations.length
          ? mdTable(
              ['Package', 'Version', 'Licence'],
              violations.map((v) => [v.name, v.version, v.license || '(none)']),
            )
          : ''),
    );
    if (scanned === 0) {
      annotate('error', `no packages found under ${nodeModules} - install dependencies before the licence gate`);
      return 1;
    }
    return violations.length > 0 ? 1 : 0;
  },

  quarantine() {
    const policy = loadPolicy();
    if (values.report.length === 0) throw new UsageError('quarantine needs at least one --report');
    const tests = collectFromReports(values.report.map(readJson));
    const result = evaluateQuarantine(tests, policy.testQuality);
    for (const p of result.problems) annotate('error', p.message, p.file ? { file: p.file, line: p.line } : {});
    writeSummary(
      `### Quarantine hygiene\n${result.quarantined.length}/${result.total} tests quarantined (${result.pct.toFixed(1)}%, limit ${policy.testQuality.quarantine.maxPct}%)\n\n` +
        (result.quarantined.length
          ? mdTable(
              ['Test', 'Annotation'],
              result.quarantined.map((t) => [
                t.title,
                t.annotations.find((a) => a.type === 'quarantine')?.description ?? '(missing)',
              ]),
            )
          : ''),
    );
    return result.problems.length > 0 ? 1 : 0;
  },

  flakes() {
    const policy = loadPolicy();
    if (values.report.length === 0) throw new UsageError('flakes needs at least one --report');
    const tests = collectFromReports(values.report.map(readJson));
    const budget = policy.testQuality.flakeRateBudgetPct;
    const result = evaluateFlakes(tests, budget);
    for (const t of result.flaky)
      annotate('warning', `flaky: ${t.title} (passed after ${t.retries} retr${t.retries === 1 ? 'y' : 'ies'})`, {
        file: t.file,
        line: t.line,
      });
    if (result.overBudget) annotate('error', `flake rate ${result.rate.toFixed(2)}% exceeds the ${budget}% budget`);
    if (values.out) {
      mkdirSync(path.dirname(path.resolve(values.cwd, values.out)), { recursive: true });
      writeFileSync(
        path.resolve(values.cwd, values.out),
        JSON.stringify(
          {
            executed: result.executed,
            rate: result.rate,
            budget,
            flaky: result.flaky.map(({ title, file, line, projects, retries }) => ({
              title,
              file,
              line,
              projects,
              retries,
            })),
          },
          null,
          2,
        ),
      );
    }
    writeSummary(
      `### Flake rate\n${result.flaky.length}/${result.executed} executed tests flaky - **${result.rate.toFixed(2)}%** (budget ${budget}%)\n\n` +
        (result.flaky.length
          ? mdTable(
              ['Test', 'Projects', 'Retries'],
              result.flaky.map((t) => [t.title, [...new Set(t.projects)].join(', '), t.retries]),
            )
          : ''),
    );
    return result.overBudget ? 1 : 0;
  },

  'dast-target'() {
    const { dast } = loadPolicy().security;
    const target = values.target || dast.targetUrl;
    if (!dast.enabled) {
      annotate('notice', 'DAST is disabled in guardrails.config.yml (security.dast.enabled) - skipping');
      setOutput('enabled', 'false');
      return 0;
    }
    if (!target || !dast.authorizedHosts.includes(new URL(target).hostname)) {
      throw new GateError(
        `${target || '(no target)'} is not in security.dast.authorizedHosts - only scan systems you own or are authorised to test`,
      );
    }
    setOutput('enabled', 'true');
    setOutput('target', target);
    console.log(target);
    return 0;
  },

  'pinned-actions'() {
    const policy = loadPolicy();
    const dirs = (values.dir.length ? values.dir : ['.github/workflows', '.github/actions']).map((d) =>
      path.resolve(values.cwd, d),
    );
    const findings = findUnpinned(dirs, values['trusted-owner']);
    const level = policy.supplyChain.pinnedActions === 'block' ? 'error' : 'warning';
    for (const f of findings)
      annotate(level, `${f.ref} is not pinned to a full commit SHA`, { file: rel(f.file), line: f.line });
    writeSummary(
      `### Action pinning\n${findings.length} unpinned action reference(s) - policy: **${policy.supplyChain.pinnedActions}**`,
    );
    return findings.length > 0 && level === 'error' ? 1 : 0;
  },
};

class UsageError extends Error {}
class GateError extends Error {}

const [command] = positionals;
if (values.help || !command) {
  console.log(USAGE);
  process.exit(command || values.help ? 0 : 2);
}
if (!(command in commands)) {
  console.error(`unknown command "${command}"\n\n${USAGE}`);
  process.exit(2);
}

try {
  process.exitCode = commands[command]();
} catch (error) {
  if (error instanceof PolicyError) {
    for (const problem of error.problems)
      annotate('error', problem, { file: values.policy ?? 'guardrails.config.yml' });
    process.exitCode = 1;
  } else if (error instanceof GateError) {
    annotate('error', error.message);
    process.exitCode = 1;
  } else if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
