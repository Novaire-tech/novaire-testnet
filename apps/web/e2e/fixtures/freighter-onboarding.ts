import { type BrowserContext, type Page } from '@playwright/test';
import { getFreighterExtensionId } from './freighter-extension';

/**
 * Drives Freighter's real extension UI. These selectors target the extension's
 * own onboarding/popup screens, which this repo does not control — re-verify
 * them whenever the vendored Freighter version (apps/web/e2e/vendor/README.md)
 * is bumped.
 */

const EPHEMERAL_PASSWORD = 'E2eTestOnly-Password-1!';

export async function onboardFreighter(
  context: BrowserContext,
  account: { secretKey: string },
): Promise<void> {
  const extensionId = await getFreighterExtensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html#/recover-account`);

  await page.getByRole('button', { name: /import|recover/i }).first().click();
  await page.getByPlaceholder(/secret key/i).fill(account.secretKey);
  await page.getByPlaceholder(/^password$/i).first().fill(EPHEMERAL_PASSWORD);
  await page.getByPlaceholder(/confirm password/i).fill(EPHEMERAL_PASSWORD);
  await page.getByRole('button', { name: /import|confirm|continue/i }).last().click();

  // Freighter defaults to a mainnet-like network; switch explicitly to Testnet
  // to match apps/web's NEXT_PUBLIC_NETWORK_PASSPHRASE.
  await page.getByRole('button', { name: /network/i }).click();
  await page.getByText(/^Testnet$/i).click();

  await page.close();
}

// Handles the popup Freighter opens when the dApp calls requestAccess().
export async function approveConnection(context: BrowserContext, trigger: () => Promise<void>): Promise<void> {
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    trigger(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.getByRole('button', { name: /connect|approve/i }).click();
}

// Handles the popup Freighter opens when the dApp calls signTransaction().
export async function approveSignature(context: BrowserContext, trigger: () => Promise<void>): Promise<void> {
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    trigger(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.getByRole('button', { name: /sign|confirm|approve/i }).click();
}

export type { Page };
