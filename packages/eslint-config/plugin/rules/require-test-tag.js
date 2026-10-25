import { memberChain, staticText } from '../utils.js';

const TAG = /@[\w-]+/g;
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

/**
 * Every test must carry at least one approved tag, either in its own title /
 * `{ tag }` details or inherited from an enclosing `test.describe`. Tags drive
 * suite selection in CI (`--grep @smoke`), so an untagged test silently never
 * runs in the pipelines that matter.
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require approved tags on every Playwright test' },
    schema: [
      {
        type: 'object',
        properties: { allowed: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        'Test "{{title}}" has no tag - add one of {{allowed}} to the title, `{ tag }` or the enclosing describe.',
      unknown:
        'Tag {{tag}} is not approved - use one of {{allowed}} (see guardrails.config.yml testQuality.allowedTags).',
    },
  },
  create(context) {
    const allowed = new Set(context.options[0]?.allowed ?? ['@smoke', '@regression']);
    const allowedList = [...allowed].join(', ');
    const describeTags = [];

    /** @returns {'test' | 'describe' | null} */
    const kindOf = (call) => {
      const chain = call.callee.type === 'Identifier' ? [call.callee.name] : memberChain(call.callee);
      if (!chain || chain[0] !== 'test') return null;
      if (chain.length === 1) return 'test';
      if (chain[1] === 'describe') return 'describe';
      if (chain.length === 2 && TEST_MODIFIERS.has(chain[1])) return 'test';
      return null;
    };

    const tagsOf = (call) => {
      const tags = [];
      const reportUnknown = (tag, node) => {
        if (!allowed.has(tag)) context.report({ node, messageId: 'unknown', data: { tag, allowed: allowedList } });
      };
      const title = staticText(call.arguments[0]);
      if (title) {
        for (const tag of title.match(TAG) ?? []) {
          tags.push(tag);
          reportUnknown(tag, call.arguments[0]);
        }
      }
      const details = call.arguments[1];
      if (details?.type === 'ObjectExpression') {
        const tagProp = details.properties.find(
          (p) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'tag',
        );
        const values =
          tagProp?.value.type === 'ArrayExpression' ? tagProp.value.elements : tagProp ? [tagProp.value] : [];
        for (const v of values) {
          const tag = staticText(v);
          if (tag) {
            tags.push(tag);
            reportUnknown(tag, v);
          } else if (v) {
            tags.push('(dynamic)'); // computed tag: trust it, cannot verify statically
          }
        }
      }
      return tags;
    };

    return {
      CallExpression(call) {
        const kind = kindOf(call);
        const hasTitle = staticText(call.arguments[0]) !== null;
        if (kind === 'describe') {
          describeTags.push(hasTitle ? tagsOf(call) : []);
        } else if (kind === 'test' && hasTitle && call.arguments.some((a) => a.type.endsWith('FunctionExpression'))) {
          const own = tagsOf(call);
          if (own.length === 0 && describeTags.every((t) => t.length === 0)) {
            context.report({
              node: call.arguments[0],
              messageId: 'missing',
              data: { title: staticText(call.arguments[0]).trim(), allowed: allowedList },
            });
          }
        }
      },
      'CallExpression:exit'(call) {
        if (kindOf(call) === 'describe') describeTags.pop();
      },
    };
  },
};
