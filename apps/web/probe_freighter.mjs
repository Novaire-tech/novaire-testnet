import { chromium } from '@playwright/test';
import path from 'path';

const EXT_PATH = path.resolve('/Users/ahir/Projects/novaire-testnet/apps/web/e2e/vendor/freighter-extension');
const CHROME = "/Users/ahir/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const context = await chromium.launchPersistentContext('', {
  headless: false,
  executablePath: CHROME,
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
  ],
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
const extId = new URL(worker.url()).host;
console.log('EXT_ID', extId);

const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/index.html`);
await page.getByText('I already have a wallet').click();
await page.locator('#new-password-input').fill('E2eTestOnly-Password-1!');
await page.locator('#confirm-password-input').fill('E2eTestOnly-Password-1!');
await page.locator('#termsOfUse-input').check({ force: true });
await page.getByTestId('account-creator-submit').click();

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const words = mnemonic.split(' ');
for (let i = 0; i < words.length; i++) {
  await page.locator(`#MnemonicPhrase-${i + 1}`).fill(words[i]);
}
await page.getByRole('button', { name: 'Import' }).click();
await page.waitForURL(/#\/recover-account-success/, { timeout: 20000 });
console.log('onboarded, url:', page.url());

await page.screenshot({ path: '/tmp/freighter1.png' });
console.log(await page.content());
