import { describe, it } from 'node:test';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../plugin/index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const { rules } = plugin;

const cwd = process.cwd(); // RuleTester lints with context.cwd === process.cwd()
const appFile = (app, rel) => path.join(cwd, 'src', 'apps', app, rel);

ruleTester.run('no-page-in-spec', rules['no-page-in-spec'], {
  valid: [`test('@smoke ok', async ({ loginPage }) => { await loginPage.open(); });`],
  invalid: [
    {
      code: `test('@smoke bad', async ({ page }) => { await page.goto('/'); });`,
      errors: [{ messageId: 'destructured' }, { messageId: 'used' }],
    },
  ],
});

ruleTester.run('no-inline-locator', rules['no-inline-locator'], {
  valid: [`expect(await checkoutPage.getErrorMessage()).toContain('required');`],
  invalid: [
    { code: `await page.getByRole('button').click();`, errors: [{ messageId: 'inline' }] },
    { code: `const x = cartPage.locator('.x');`, errors: [{ messageId: 'inline' }] },
  ],
});

ruleTester.run('page-object-encapsulation', rules['page-object-encapsulation'], {
  valid: [
    `class P extends BasePage {
       private readonly title = this.page.locator('.title');
       private item(name: string) { return this.page.locator('.item', { hasText: name }); }
       async open(name: string) { await this.actions.click(this.item(name), 'item'); }
     }`,
  ],
  invalid: [
    {
      code: `class P { readonly title = this.page.locator('.title'); }`,
      errors: [{ messageId: 'locatorField' }],
    },
    {
      code: `class P { async go() { await this.actions.click(this.page.getByRole('link').first(), 'x'); } }`,
      errors: [{ messageId: 'locatorInPublicMethod' }],
    },
    {
      code: `class P { private readonly btn = this.page.locator('b'); async go() { await this.btn.click(); } }`,
      errors: [{ messageId: 'directAction' }],
    },
  ],
});

ruleTester.run('no-cross-app-import', rules['no-cross-app-import'], {
  valid: [
    { code: `import { x } from '../pages/login.page';`, filename: appFile('saucedemo', 'tests/a.spec.ts') },
    { code: `import { x } from '../../../core/logger';`, filename: appFile('saucedemo', 'tests/a.spec.ts') },
  ],
  invalid: [
    {
      code: `import { x } from '../../orangehrms/pages/login.page';`,
      filename: appFile('saucedemo', 'tests/a.spec.ts'),
      errors: [{ messageId: 'crossApp' }],
    },
    {
      code: `import { x } from '@apps/bookstore/app.config';`,
      filename: appFile('saucedemo', 'pages/a.page.ts'),
      errors: [{ messageId: 'crossApp' }],
    },
  ],
});

const tagOptions = [{ allowed: ['@smoke', '@regression', '@api'] }];
ruleTester.run('require-test-tag', rules['require-test-tag'], {
  valid: [
    { code: `test('@smoke logs in', async () => {});`, options: tagOptions },
    { code: `test.describe('@regression Login', () => { test('inherits', async () => {}); });`, options: tagOptions },
    { code: `test('details tag', { tag: ['@api'] }, async () => {});`, options: tagOptions },
    { code: `test.step('not a test', async () => {});`, options: tagOptions },
    { code: `test.skip(browserName === 'webkit', 'no webkit');`, options: tagOptions },
  ],
  invalid: [
    { code: `test('untagged', async () => {});`, options: tagOptions, errors: [{ messageId: 'missing' }] },
    {
      code: `test.describe('Login', () => { test.skip('also untagged', async () => {}); });`,
      options: tagOptions,
      errors: [{ messageId: 'missing' }],
    },
    { code: `test('@wip thing', async () => {});`, options: tagOptions, errors: [{ messageId: 'unknown' }] },
  ],
});
