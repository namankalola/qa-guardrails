import path from 'node:path';

/**
 * Each app under `<appsDir>/<app>/` is self-contained: it may import from
 * itself and from core, never from a sibling app. Resolves relative imports
 * and path aliases (default `@apps/*`).
 */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow imports between sibling apps' },
    schema: [
      {
        type: 'object',
        properties: {
          appsDir: { type: 'string' },
          aliases: { type: 'object', additionalProperties: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      crossApp: '`{{from}}` must not import from app `{{to}}` - apps are isolated; move shared code to core.',
    },
  },
  create(context) {
    const { appsDir = 'src/apps', aliases = { '@apps/': 'src/apps/' } } = context.options[0] ?? {};
    const cwd = context.cwd;
    const appsRoot = path.resolve(cwd, appsDir);
    const appOf = (file) => {
      const rel = path.relative(appsRoot, file);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
      return rel.split(path.sep)[0];
    };
    const owner = appOf(context.filename);
    if (!owner) return {};

    const check = (node, source) => {
      if (typeof source !== 'string') return;
      let target = null;
      if (source.startsWith('.')) {
        target = path.resolve(path.dirname(context.filename), source);
      } else {
        const alias = Object.keys(aliases).find((a) => source.startsWith(a));
        if (alias) target = path.resolve(cwd, aliases[alias], source.slice(alias.length));
      }
      const app = target && appOf(target);
      if (app && app !== owner) context.report({ node, messageId: 'crossApp', data: { from: owner, to: app } });
    };

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) => node.source.type === 'Literal' && check(node.source, node.source.value),
    };
  },
};
