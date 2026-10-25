import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * Bounded schema for the merged (defaults + team override) policy. Objects are
 * strict so a typo in a team file (`maxRetry`) fails loudly instead of being
 * silently ignored. Hard floors are `z.literal` - see floors.mjs for the
 * friendlier error raised when a team tries to change one.
 */
export const policySchema = z.strictObject({
  version: z.literal(1),
  team: z.string().min(1),

  codeQuality: z.strictObject({
    typecheck: z.literal(true),
    lintErrors: z.literal('block'),
    maxWarnings: z.int().min(0).max(50),
    maxComplexity: z.int().min(10).max(25),
    typeSafety: z.enum(['strict', 'standard']),
    formatCheck: z.boolean(),
    conventionalCommits: z.boolean(),
  }),

  framework: z.strictObject({
    enforcePom: z.boolean(),
    appsDir: z.string().min(1),
    coreDir: z.string().min(1),
    specGlobs: z.array(z.string().min(1)).min(1),
    pageObjectGlobs: z.array(z.string().min(1)).min(1),
  }),

  testQuality: z.strictObject({
    requireTags: z.boolean(),
    allowedTags: z.array(z.string().regex(/^@[\w-]+$/, 'tags start with @')).min(1),
    assertFunctionPatterns: z.array(z.string().min(1)).min(1),
    maxRetries: z.int().min(0).max(2),
    flakeRateBudgetPct: z.number().min(0).max(10),
    requireSkipReason: z.boolean(),
    quarantine: z.strictObject({
      tag: z.string().regex(/^@[\w-]+$/),
      maxDays: z.int().min(1).max(60),
      maxPct: z.number().min(0).max(10),
      ticketPattern: z.string().min(1),
    }),
  }),

  security: z.strictObject({
    secretScanning: z.literal(true),
    vulnerabilities: z.strictObject({
      blockCritical: z.literal(true),
      failOn: z.enum(['critical', 'high', 'moderate', 'low']),
      ignore: z.array(
        z.strictObject({
          id: z.string().min(1),
          reason: z.string().min(10, 'give a real justification'),
          expires: isoDate,
        }),
      ),
    }),
    licenses: z.strictObject({
      allow: z.array(z.string().min(1)).min(1),
      additionalAllow: z.array(z.string().min(1)),
      internalScopes: z.array(z.string().regex(/^@[\w.-]+$/, 'scopes look like @acme')),
      exceptions: z.array(z.strictObject({ package: z.string().min(1), reason: z.string().min(10) })),
    }),
    sast: z.strictObject({
      semgrep: z.boolean(),
      codeql: z.boolean(),
      failOn: z.enum(['error', 'warning']),
    }),
    dast: z.strictObject({
      enabled: z.boolean(),
      targetUrl: z.union([z.literal(''), z.url()]),
      authorizedHosts: z.array(z.string().min(1)),
    }),
    container: z.strictObject({
      enabled: z.boolean(),
      dockerfile: z.string().min(1),
      context: z.string().min(1),
      failOn: z.enum(['critical', 'high', 'medium']),
    }),
  }),

  supplyChain: z.strictObject({
    pinnedActions: z.enum(['warn', 'block']),
    sbom: z.boolean(),
    provenance: z.boolean(),
  }),
});
