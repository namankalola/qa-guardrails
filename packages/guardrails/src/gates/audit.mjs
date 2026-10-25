export const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, medium: 2, high: 3, critical: 4 };

/** @typedef {{ id: string, package: string, severity: string, title: string, url: string }} Finding */

const advisoryId = (url, fallback) => url?.match(/GHSA-[\w-]+/i)?.[0] ?? String(fallback);

/**
 * Normalise `npm audit --json` (v2 report) and `pnpm audit --json` output.
 * @returns {Finding[]}
 */
export function parseAudit(report) {
  const findings = new Map();
  const add = (f) => findings.set(`${f.id}::${f.package}`, f);

  if (report?.vulnerabilities) {
    for (const vuln of Object.values(report.vulnerabilities)) {
      for (const via of vuln.via ?? []) {
        if (typeof via !== 'object') continue; // transitive pointer; the advisory itself is listed on its own package
        add({
          id: advisoryId(via.url, via.source),
          package: via.name ?? vuln.name,
          severity: via.severity ?? vuln.severity,
          title: via.title ?? '',
          url: via.url ?? '',
        });
      }
    }
  }

  if (report?.advisories) {
    for (const adv of Object.values(report.advisories)) {
      add({
        id: adv.github_advisory_id ?? advisoryId(adv.url, adv.id),
        package: adv.module_name,
        severity: adv.severity,
        title: adv.title ?? '',
        url: adv.url ?? '',
      });
    }
  }

  return [...findings.values()];
}

/**
 * Split findings into blocking / ignored / below-threshold. Critical findings
 * block regardless of the team threshold or ignore list (hard floor).
 */
export function evaluateAudit(findings, vulnerabilityPolicy) {
  const threshold = SEVERITY_RANK[vulnerabilityPolicy.failOn];
  const ignoreIds = new Set(vulnerabilityPolicy.ignore.map((i) => i.id.toUpperCase()));
  const result = { blocking: [], ignored: [], belowThreshold: [], ignoredCriticalAttempts: [] };

  for (const f of findings) {
    const rank = SEVERITY_RANK[f.severity] ?? SEVERITY_RANK.critical; // unknown severity fails closed
    const ignored = ignoreIds.has(f.id.toUpperCase());
    if (rank >= SEVERITY_RANK.critical) {
      result.blocking.push(f);
      if (ignored) result.ignoredCriticalAttempts.push(f);
    } else if (ignored) {
      result.ignored.push(f);
    } else if (rank >= threshold) {
      result.blocking.push(f);
    } else {
      result.belowThreshold.push(f);
    }
  }
  return result;
}
