import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SettingsMenu } from './SettingsMenu';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  // jsdom lacks native dialog methods. Focus and component events remain real.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
});
afterEach(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

it('opens labelled settings with its form content and restores focus when closed', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<SettingsMenu onOpenChange={changed}><label><input type="checkbox"/>Enable offline practice</label></SettingsMenu>);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(within(dialog).getByRole('checkbox', { name: 'Enable offline practice' })).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Close settings' })).toHaveFocus();
  await user.click(within(dialog).getByRole('button', { name: 'Close settings' }));
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(changed.mock.calls).toEqual([[true], [false]]);
});

it('handles the browser Escape cancellation event and permits reopening', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<SettingsMenu onOpenChange={changed}><p>Practice preferences</p></SettingsMenu>);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  await user.click(trigger);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  expect(changed.mock.calls).toEqual([[true], [false], [true]]);
});

it('keeps clicks inside the settings surface open and dismisses a backdrop click', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<SettingsMenu onOpenChange={changed}><button>Preference action</button></SettingsMenu>);
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  const dialog = screen.getByRole('dialog');
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 50, right: 250, bottom: 250, width: 200, height: 200, x: 50, y: 50, toJSON() {} });
  fireEvent.click(dialog, { clientX: 60, clientY: 60 });
  expect(dialog).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Preference action' }));
  expect(dialog).toBeVisible();
  fireEvent.click(dialog, { clientX: 20, clientY: 20 });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(changed.mock.calls).toEqual([[true], [false]]);
});

it('responds to a native close event without requiring the close button', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<SettingsMenu onOpenChange={changed}><p>Practice preferences</p></SettingsMenu>);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  await user.click(trigger);
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close());
  expect(trigger).toHaveFocus(); expect(changed).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
