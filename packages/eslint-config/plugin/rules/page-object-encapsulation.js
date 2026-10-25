import { ACTION_METHODS, buildsLocator, memberChain } from '../utils.js';

/**
 * Page object layering (POM rules 3 and 4):
 *  - locator fields are `private readonly`
 *  - locators are not built inside public methods (private factory methods such as
 *    `addToCartButton(name)` are allowed for parameterised locators)
 *  - element interactions go through `this.actions` (WebActions), never `locator.click()`
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce page object encapsulation: private locators, WebActions for interactions' },
    schema: [
      {
        type: 'object',
        properties: {
          actionsProperty: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      locatorField: 'Locator field `{{name}}` must be `private readonly` (POM rule 3).',
      locatorInPublicMethod:
        'Public method `{{name}}` builds a locator - declare it as a `private readonly` field or a private factory method (POM rule 3).',
      directAction:
        '`.{{method}}()` bypasses WebActions - use `this.{{actions}}.{{method}}(...)` so the step is logged and waited consistently (POM rule 4).',
    },
  },
  create(context) {
    const actions = context.options[0]?.actionsProperty ?? 'actions';
    const methodStack = [];

    return {
      PropertyDefinition(node) {
        if (!node.value || !buildsLocator(node.value)) return;
        if (node.accessibility !== 'private' || !node.readonly) {
          const name = node.key.type === 'Identifier' ? node.key.name : '<computed>';
          context.report({ node: node.key, messageId: 'locatorField', data: { name } });
        }
      },
      MethodDefinition(node) {
        methodStack.push(node);
      },
      'MethodDefinition:exit'() {
        methodStack.pop();
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const method = methodStack.at(-1);

        if (ACTION_METHODS.has(callee.property.name)) {
          const receiver = memberChain(callee.object);
          const viaActions = receiver?.[0] === 'this' && receiver[1] === actions;
          if (!viaActions && !(receiver?.length === 1 && receiver[0] === actions)) {
            context.report({
              node: callee.property,
              messageId: 'directAction',
              data: { method: callee.property.name, actions },
            });
          }
        }

        // report a chain like `this.page.locator(a).locator(b)` once, at its outermost call
        const isInnerLink = node.parent?.type === 'MemberExpression' && node.parent.object === node;
        if (
          !isInnerLink &&
          buildsLocator(node) &&
          method?.kind === 'method' &&
          method.accessibility !== 'private' &&
          method.accessibility !== 'protected' &&
          method.key.type !== 'PrivateIdentifier'
        ) {
          const name = method.key.type === 'Identifier' ? method.key.name : '<computed>';
          context.report({ node, messageId: 'locatorInPublicMethod', data: { name } });
        }
      },
    };
  },
};
