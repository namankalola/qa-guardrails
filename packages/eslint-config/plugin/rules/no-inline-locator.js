import { LOCATOR_METHODS } from '../utils.js';

/** Zero locators in spec files - every locator lives in a page object (POM rule 3). */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow building Playwright locators outside page objects' },
    schema: [],
    messages: {
      inline:
        '`{{method}}()` builds a locator inline - define it as a `private readonly` field in a page object (POM rule 3).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === 'MemberExpression' && !callee.computed && LOCATOR_METHODS.has(callee.property.name)) {
          context.report({ node: callee.property, messageId: 'inline', data: { method: callee.property.name } });
        }
      },
    };
  },
};
