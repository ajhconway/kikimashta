import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountRuntime, AccountSnapshot } from '../sync/runtime';
import { AccountPanel } from './AccountPanel';

type Actions = Pick<AccountRuntime, 'sendCode' | 'verifyCode' | 'signOut' | 'copyGuestProgress' | 'sync'>;
const guest: AccountSnapshot = { loading: false, user: null, status: 'idle', error: null, revision: 0 };
const signedIn: AccountSnapshot = { ...guest, user: { id: 'test-account', email: 'learner@example.invalid' }, status: 'synced' };
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
let actions: Actions;

beforeEach(() => {
  // jsdom has no native modal behavior. Stub only that browser boundary;
  // forms, validation, focus, promises and component state remain real.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
  actions = {
    sendCode: vi.fn<Actions['sendCode']>().mockResolvedValue(undefined),
    verifyCode: vi.fn<Actions['verifyCode']>().mockResolvedValue(undefined),
    signOut: vi.fn<Actions['signOut']>().mockResolvedValue(undefined),
    copyGuestProgress: vi.fn<Actions['copyGuestProgress']>().mockResolvedValue(undefined),
    sync: vi.fn<Actions['sync']>().mockResolvedValue(undefined),
  };
});
afterEach(() => {
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function openGuest() {
  const user = userEvent.setup();
  const view = render(<AccountPanel state={guest} runtime={actions}/>);
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
  const dialog = screen.getByRole('dialog', { name: /^sign in$/i });
  return { ...view, user, dialog };
}
async function requestCode() {
  const view = await openGuest();
  await view.user.type(within(view.dialog).getByLabelText('Email'), 'learner@example.invalid');
  await view.user.click(within(view.dialog).getByRole('button', { name: /^send code$/i }));
  return view;
}

describe('optional account panel', () => {
  it('opens a focused native dialog without sending anything, then restores focus when closed', async () => {
    const { user, dialog } = await openGuest();
    const trigger = screen.getByRole('button', { name: /^sign in$/i });
    expect(within(dialog).getByLabelText('Email')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Email'), 'learner@example.invalid');
    expect(actions.sendCode).not.toHaveBeenCalled();
    expect(actions.copyGuestProgress).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /close account/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(actions.sendCode).not.toHaveBeenCalled();
  });

  it('prevents duplicate pending requests, preserves the email on failure and allows an explicit retry', async () => {
    const pending = deferred();
    vi.mocked(actions.sendCode).mockReturnValueOnce(pending.promise);
    const { user, dialog } = await openGuest();
    const email = within(dialog).getByLabelText('Email');
    await user.type(email, 'learner@example.invalid');
    await user.click(within(dialog).getByRole('button', { name: /^send code$/i }));
    expect(within(dialog).getByRole('button', { name: /sending/i })).toBeDisabled();
    fireEvent.submit(email.closest('form')!);
    expect(actions.sendCode).toHaveBeenCalledExactlyOnceWith('learner@example.invalid');
    await act(async () => { pending.reject(new Error('Delivery failed')); });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/couldn't be sent/i);
    expect(email).toHaveValue('learner@example.invalid');
    await user.click(within(dialog).getByRole('button', { name: /^send code$/i }));
    expect(actions.sendCode).toHaveBeenCalledTimes(2);
    expect(await within(dialog).findByLabelText('Email code')).toHaveFocus();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['123456', '12345678', '1234567890'])('verifies a valid %s email code and closes without copying guest data', async code => {
    const { user, dialog } = await requestCode();
    await user.type(within(dialog).getByLabelText('Email code'), code);
    await user.click(within(dialog).getByRole('button', { name: /^sign in$/i }));
    expect(actions.verifyCode).toHaveBeenCalledExactlyOnceWith('learner@example.invalid', code);
    expect(actions.copyGuestProgress).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toHaveFocus();
  });

  it('rejects incomplete tokens locally and permits retrying a server-rejected code', async () => {
    vi.mocked(actions.verifyCode).mockRejectedValueOnce(new Error('Expired'));
    const { user, dialog } = await requestCode();
    const code = within(dialog).getByLabelText('Email code');
    await user.type(code, '1234');
    expect(within(dialog).getByRole('button', { name: /^sign in$/i })).toBeDisabled();
    fireEvent.submit(code.closest('form')!);
    expect(actions.verifyCode).not.toHaveBeenCalled();
    await user.type(code, '56');
    await user.click(within(dialog).getByRole('button', { name: /^sign in$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/code didn't work/i);
    expect(code).toHaveValue('123456');
    await user.click(within(dialog).getByRole('button', { name: /^sign in$/i }));
    expect(actions.verifyCode).toHaveBeenCalledTimes(2);
  });

  it('resends only on request and changing the email does not send a code', async () => {
    const { user, dialog } = await requestCode();
    expect(actions.sendCode).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: /send a new code/i }));
    expect(actions.sendCode).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByRole('status')).toHaveTextContent(/new code is on its way/i);
    await user.click(within(dialog).getByRole('button', { name: /use another email/i }));
    await user.clear(within(dialog).getByLabelText('Email'));
    await user.type(within(dialog).getByLabelText('Email'), 'another@example.invalid');
    expect(actions.sendCode).toHaveBeenCalledTimes(2);
  });

  it('offers sync, explicit additive guest copying and sign-out only after the user chooses them', async () => {
    const user = userEvent.setup();
    render(<AccountPanel state={signedIn} runtime={actions}/>);
    expect(screen.getByRole('status', { name: 'Sync status' })).toHaveTextContent('Up to date');
    await user.click(screen.getByRole('button', { name: /^account$/i }));
    const dialog = screen.getByRole('dialog', { name: 'Your account' });
    expect(within(dialog).getByText('learner@example.invalid')).toBeInTheDocument();
    expect(actions.sync).not.toHaveBeenCalled();
    expect(actions.copyGuestProgress).not.toHaveBeenCalled();
    expect(actions.signOut).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /sync now/i }));
    expect(actions.sync).toHaveBeenCalledTimes(1);
    expect(actions.copyGuestProgress).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/local copy stays here/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /copy this device's progress/i }));
    expect(actions.copyGuestProgress).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('status')).toHaveTextContent('Copied into this account.');
    await user.click(within(dialog).getByRole('button', { name: /sign out/i }));
    expect(actions.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^account$/i })).toHaveFocus();
  });

  it('returns to the email step after signing out instead of reusing an old sign-in code', async () => {
    const view = await requestCode();
    await view.user.type(within(view.dialog).getByLabelText('Email code'), '123456');
    await view.user.click(within(view.dialog).getByRole('button', { name: /^sign in$/i }));
    view.rerender(<AccountPanel state={signedIn} runtime={actions}/>);
    await view.user.click(screen.getByRole('button', { name: /^account$/i }));
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /sign out/i }));
    view.rerender(<AccountPanel state={guest} runtime={actions}/>);
    await view.user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Email')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByLabelText('Email code')).not.toBeInTheDocument();
    expect(actions.sendCode).toHaveBeenCalledTimes(1);
  });

  it('shows a failed account action and keeps its explicit retry available', async () => {
    const user = userEvent.setup();
    vi.mocked(actions.copyGuestProgress).mockRejectedValueOnce(new Error('Storage failed'));
    render(<AccountPanel state={signedIn} runtime={actions}/>);
    await user.click(screen.getByRole('button', { name: /^account$/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /copy this device's progress/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/couldn't be copied/i);
    await user.click(within(dialog).getByRole('button', { name: /copy this device's progress/i }));
    await waitFor(() => expect(actions.copyGuestProgress).toHaveBeenCalledTimes(2));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
