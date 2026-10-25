import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ name: string, version: string, license: string, dir: string }} InstalledPackage */

function readManifest(dir) {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** `license` may be a string, a legacy `{ type }` object, or a `licenses` array. */
export function licenseOf(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === 'string') return license;
  if (license && typeof license.type === 'string') return license.type;
  if (Array.isArray(licenses)) {
    return licenses
      .map((l) => (typeof l === 'string' ? l : l?.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return '';
}

/**
 * Walk an installed node_modules tree (npm nested layout or pnpm's `.pnpm`
 * store) without following symlinks, so pnpm's top-level links are not
 * double counted.
 * @returns {InstalledPackage[]}
 */
export function collectPackages(nodeModulesDir) {
  const seen = new Map();

  const visitPackage = (dir) => {
    const manifest = readManifest(dir);
    if (manifest?.name && manifest.version && !manifest.private) {
      const key = `${manifest.name}@${manifest.version}`;
      if (!seen.has(key))
        seen.set(key, { name: manifest.name, version: manifest.version, license: licenseOf(manifest), dir });
    }
    const nested = path.join(dir, 'node_modules');
    if (existsSync(nested)) visitNodeModules(nested);
  };

  const visitNodeModules = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === '.pnpm') {
        for (const store of readdirSync(full, { withFileTypes: true })) {
          const storeModules = path.join(full, store.name, 'node_modules');
          if (store.isDirectory() && existsSync(storeModules)) visitNodeModules(storeModules);
        }
      } else if (entry.name.startsWith('.')) {
        continue;
      } else if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(full, { withFileTypes: true })) {
          if (scoped.isDirectory() && !scoped.isSymbolicLink()) visitPackage(path.join(full, scoped.name));
        }
      } else {
        visitPackage(full);
      }
    }
  };

  if (existsSync(nodeModulesDir)) visitNodeModules(nodeModulesDir);
  return [...seen.values()];
}

/** Common non-SPDX spellings found in older packages, mapped to their SPDX id. */
const ALIASES = new Map([
  ['MIT/X11', 'MIT'],
  ['X11', 'MIT'],
  ['Apache 2.0', 'Apache-2.0'],
  ['Apache License 2.0', 'Apache-2.0'],
  ['Apache-2', 'Apache-2.0'],
  ['BSD-3', 'BSD-3-Clause'],
  ['BSD-2', 'BSD-2-Clause'],
]);

/** Minimal SPDX expression check: any OR-branch whose AND-terms are all allowed. */
export function isLicenseAllowed(expression, allowed) {
  if (!expression) return false;
  const cleaned = (ALIASES.get(expression.trim()) ?? expression).replace(/[()]/g, ' ').trim();
  return cleaned.split(/\s+OR\s+/i).some((branch) =>
    branch
      .split(/\s+AND\s+/i)
      .map((term) =>
        term
          .split(/\s+WITH\s+/i)[0]
          .trim()
          .replace(/\+$/, ''),
      )
      .every((id) => allowed.has(id)),
  );
}

export function evaluateLicenses(packages, licensePolicy) {
  const allowed = new Set([...licensePolicy.allow, ...licensePolicy.additionalAllow]);
  const excepted = new Set(licensePolicy.exceptions.map((e) => e.package));
  const internal = (name) => licensePolicy.internalScopes.some((scope) => name.startsWith(`${scope}/`));
  const violations = packages.filter(
    (p) => !internal(p.name) && !excepted.has(p.name) && !isLicenseAllowed(p.license, allowed),
  );
  return { scanned: packages.length, violations };
}
