import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const USES = /^\s*-?\s*uses:\s*['"]?([^\s'"#]+)/;
const FULL_SHA = /@[0-9a-f]{40}$/;

/**
 * Find `uses:` references that are not pinned to a full commit SHA. Tags and
 * branches are mutable - a compromised upstream can retarget them (cf. the
 * tj-actions/changed-files incident). Local actions and owners listed in
 * `trustedOwners` (our own reusable workflows, released as immutable tags)
 * are exempt.
 */
export function findUnpinned(dirs, trustedOwners = []) {
  const findings = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const file = path.join(entry.parentPath, entry.name);
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((text, index) => {
          const ref = text.match(USES)?.[1];
          if (!ref || ref.startsWith('./')) return;
          if (ref.startsWith('docker://')) {
            if (!ref.includes('@sha256:')) findings.push({ file, line: index + 1, ref });
            return;
          }
          if (trustedOwners.includes(ref.split('/')[0])) return;
          if (!FULL_SHA.test(ref)) findings.push({ file, line: index + 1, ref });
        });
    }
  }
  return findings;
}
