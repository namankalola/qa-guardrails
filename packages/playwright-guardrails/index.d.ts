import type { PlaywrightTestConfig } from '@playwright/test';

export interface GuardrailsOptions {
  /** Report name; the JSON report is written to `<reportDir>/<name>.json`. */
  name?: string;
  /** Directory for guardrail JSON reports. Default `reports/guardrails`. */
  reportDir?: string;
}

export function withGuardrails<T extends PlaywrightTestConfig>(config: T, options?: GuardrailsOptions): T;

export interface QuarantineDetails {
  tag: string;
  annotation: { type: 'quarantine'; description: string };
}

export function quarantine(ticket: string, until: string, reason?: string): QuarantineDetails;
