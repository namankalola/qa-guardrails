import { createConfig } from '@ariseqa/eslint-config';

// Severities and globs come from guardrails.config.yml; extend here only for repo-specific needs.
export default createConfig({ tsconfigRootDir: import.meta.dirname });
