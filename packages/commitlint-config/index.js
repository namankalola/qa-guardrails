/**
 * Conventional Commits: enforces the type vocabulary and subject hygiene.
 * PR titles are linted with the same config, since squash merge makes the
 * title the commit on main.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'test', 'refactor', 'perf', 'docs', 'build', 'ci', 'chore', 'revert']],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
  },
};
