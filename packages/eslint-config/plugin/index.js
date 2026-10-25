import noPageInSpec from './rules/no-page-in-spec.js';
import noInlineLocator from './rules/no-inline-locator.js';
import pageObjectEncapsulation from './rules/page-object-encapsulation.js';
import noCrossAppImport from './rules/no-cross-app-import.js';
import requireTestTag from './rules/require-test-tag.js';

/** `acme-qa` ESLint plugin: the framework's architecture rules as code. */
export default {
  meta: { name: '@acme/eslint-plugin-qa', version: '1.0.0' },
  rules: {
    'no-page-in-spec': noPageInSpec,
    'no-inline-locator': noInlineLocator,
    'page-object-encapsulation': pageObjectEncapsulation,
    'no-cross-app-import': noCrossAppImport,
    'require-test-tag': requireTestTag,
  },
};
