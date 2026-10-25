/**
 * Specs talk to page objects, never to the raw Playwright `page` fixture.
 * Catches both `async ({ page }) => ...` and any `page.*` member access.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow using the raw `page` fixture in spec files' },
    schema: [],
    messages: {
      destructured:
        'Specs must not take the raw `page` fixture - inject a page object from the app fixtures instead (POM rule 2).',
      used: 'Specs must not call `page.{{member}}` - move this interaction into a page object method (POM rule 2).',
    },
  },
  create(context) {
    const isTestCallback = (fn) => fn.parent?.type === 'CallExpression' && fn.parent.arguments.includes(fn);
    return {
      'ArrowFunctionExpression, FunctionExpression'(fn) {
        const [first] = fn.params;
        if (first?.type !== 'ObjectPattern' || !isTestCallback(fn)) return;
        for (const prop of first.properties) {
          if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.key.name === 'page') {
            context.report({ node: prop, messageId: 'destructured' });
          }
        }
      },
      MemberExpression(node) {
        if (node.object.type === 'Identifier' && node.object.name === 'page' && !node.computed) {
          context.report({ node, messageId: 'used', data: { member: node.property.name } });
        }
      },
    };
  },
};
