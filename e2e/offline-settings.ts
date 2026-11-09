import { expect, type Page } from './fixtures';
export async function openOfflineSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  return page.getByRole('dialog', { name: 'Settings', exact: true });
}
export async function prepareOffline(page: Page) {
  const dialog = await openOfflineSettings(page);
  const checkbox = dialog.getByRole('checkbox', { name: 'Enable offline practice' });
  await expect(checkbox).toBeEnabled();
  if (!await checkbox.isChecked()) await checkbox.check();
  else if (await dialog.getByRole('button', { name: 'Download selected packs', exact: true }).count()) {
    await dialog.getByRole('button', { name: 'Download selected packs', exact: true }).click();
  }
  await expect(dialog.getByText('Selected packs are ready for offline practice.')).toBeVisible({ timeout: 120000 });
  await dialog.getByRole('button', { name: 'Close settings' }).click();
}
export async function disableOffline(page: Page) {
  const dialog = await openOfflineSettings(page);
  await dialog.getByRole('checkbox', { name: 'Enable offline practice' }).uncheck();
  await expect(dialog.getByText('Offline practice is off.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close settings' }).click();
}
