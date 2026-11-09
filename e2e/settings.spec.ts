import { expect, test } from './fixtures';

test('Home settings fit small screens, show size before enabling and restore keyboard focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const settings = await trigger.boundingBox();
    const language = await page.getByRole('combobox', { name: 'Learning language' }).boundingBox();
    expect(settings!.width).toBeGreaterThanOrEqual(44); expect(settings!.height).toBeGreaterThanOrEqual(44);
    expect(settings!.x + settings!.width).toBeLessThan(language!.x);
    expect(language!.x + language!.width).toBeLessThanOrEqual(width);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/About \d+\.\d MB of storage/)).toBeVisible();
    const checkbox = dialog.getByRole('checkbox', { name: 'Enable offline practice' });
    await expect(checkbox).not.toBeChecked(); await expect(checkbox).toBeEnabled();
    const close = dialog.getByRole('button', { name: 'Close settings' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(checkbox).toBeFocused();
    await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active)).toBeUndefined();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
  await expect(trigger).toBeFocused();
});
