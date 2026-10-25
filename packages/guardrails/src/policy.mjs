import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { policySchema } from './schema.mjs';
import { checkFloors } from './floors.mjs';

/** @typedef {import('zod').infer<typeof policySchema>} Policy */

export const POLICY_FILE = 'guardrails.config.yml';
const DEFAULTS_PATH = fileURLToPath(new URL('../defaults.yml', import.meta.url));

export class PolicyError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`guardrails policy is invalid:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

export function loadDefaults() {
  return YAML.parse(readFileSync(DEFAULTS_PATH, 'utf8'));
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Objects merge recursively; arrays and scalars in `override` replace `base`. */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Resolve the effective policy for a repository: enterprise defaults, overlaid
 * with the team's guardrails.config.yml, validated against bounds and floors.
 *
 * @param {{ cwd?: string, file?: string, now?: Date, overrides?: Record<string, unknown> }} [options]
 * @returns {{ policy: Policy, source: string | null }}
 * @throws {PolicyError}
 */
export function resolvePolicy({ cwd = process.cwd(), file = POLICY_FILE, now = new Date(), overrides } = {}) {
  const policyPath = path.resolve(cwd, file);
  const hasFile = overrides === undefined && existsSync(policyPath);
  const raw = overrides ?? (hasFile ? (YAML.parse(readFileSync(policyPath, 'utf8')) ?? {}) : {});
  if (!isPlainObject(raw)) throw new PolicyError([`${file} must be a YAML mapping`]);

  const parsed = policySchema.safeParse(deepMerge(loadDefaults(), raw));
  if (!parsed.success) {
    throw new PolicyError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }

  const violations = checkFloors(raw, parsed.data, now);
  if (violations.length > 0) throw new PolicyError(violations);

  return { policy: parsed.data, source: hasFile ? policyPath : null };
}
