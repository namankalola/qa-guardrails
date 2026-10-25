/** Playwright locator factories - building one is "creating a locator". */
export const LOCATOR_METHODS = new Set([
  'locator',
  'frameLocator',
  'getByRole',
  'getByLabel',
  'getByPlaceholder',
  'getByText',
  'getByAltText',
  'getByTitle',
  'getByTestId',
  '$',
  '$$',
]);

/** Element interactions that must go through the shared WebActions wrapper. */
export const ACTION_METHODS = new Set([
  'click',
  'dblclick',
  'fill',
  'type',
  'press',
  'pressSequentially',
  'check',
  'uncheck',
  'setChecked',
  'selectOption',
  'hover',
  'tap',
  'focus',
  'blur',
  'clear',
  'dragTo',
  'setInputFiles',
  'selectText',
]);

/** `a.b.c` -> ['a', 'b', 'c'] for non-computed member chains, else null. */
export function memberChain(node) {
  const parts = [];
  let current = node;
  while (current.type === 'MemberExpression') {
    if (current.computed || current.property.type !== 'Identifier') return null;
    parts.unshift(current.property.name);
    current = current.object;
  }
  if (current.type === 'Identifier') parts.unshift(current.name);
  else if (current.type === 'ThisExpression') parts.unshift('this');
  else return null;
  return parts;
}

/** Does `node` (an expression) contain a call to a locator factory anywhere in its chain? */
export function buildsLocator(node) {
  let current = node;
  while (current) {
    if (
      current.type === 'AwaitExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression'
    ) {
      current = current.expression;
    } else if (current.type === 'CallExpression') {
      const { callee } = current;
      if (callee.type === 'MemberExpression' && !callee.computed && LOCATOR_METHODS.has(callee.property.name))
        return true;
      current = callee.type === 'MemberExpression' ? callee.object : null;
    } else if (current.type === 'MemberExpression') {
      current = current.object;
    } else {
      return false;
    }
  }
  return false;
}

/** Static text of a string literal or template literal (expressions dropped). */
export function staticText(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? '').join(' ');
  return null;
}
