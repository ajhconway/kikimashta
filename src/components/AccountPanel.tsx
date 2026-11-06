import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AccountRuntime, AccountSnapshot } from '../sync/runtime';
import { EmailCodeRateLimitError } from '../sync/runtime';
import './AccountPanel.css';

type AccountActions = Pick<AccountRuntime, 'sendCode' | 'verifyCode' | 'signOut' | 'copyGuestProgress' | 'sync'>;
const syncLabels: Record<AccountSnapshot['status'], string> = {
  idle: 'Ready', syncing: 'Syncing…', synced: 'Up to date', error: 'Needs sync',
};

export function AccountPanel({ state, runtime }: { state: AccountSnapshot; runtime: AccountActions }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const titleId = useId();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [codeEmail, setCodeEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const disabled = busy || state.loading;
  const status = state.loading ? 'Checking…' : syncLabels[state.status];
  const error = actionError || state.error;

  function focusField() {
    if (!state.user) (step === 'email' ? emailInput.current : codeInput.current)?.focus();
  }
  function open() {
    if (!dialog.current?.open) dialog.current?.showModal();
    focusField();
  }
  function close() { dialog.current?.close(); }
  function finishAuthentication() {
    close(); setStep('email'); setCodeEmail(''); setToken('');
  }
  useEffect(() => {
    if (dialog.current?.open && !state.user) {
      (step === 'email' ? emailInput.current : codeInput.current)?.focus();
    }
  }, [step, state.user]);

  async function perform(action: () => Promise<void>, failure: string, success?: () => void) {
    if (pending.current || state.loading) return;
    pending.current = true;
    setBusy(true); setActionError(null); setMessage(null);
    try { await action(); success?.(); }
    catch (error) { setActionError(error instanceof EmailCodeRateLimitError
      ? 'Too many sign-in emails have been requested. Please wait before requesting another code.'
      : failure); }
    finally { pending.current = false; setBusy(false); }
  }
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailInput.current?.reportValidity()) return;
    const address = email.trim();
    void perform(() => runtime.sendCode(address), "The code couldn't be sent. Please try again.", () => {
      setCodeEmail(address); setToken(''); setStep('code');
    });
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6,10}$/.test(token)) return;
    void perform(() => runtime.verifyCode(codeEmail, token), "That code didn't work. Check it or request a new code.", finishAuthentication);
  }
  function resend() {
    void perform(() => runtime.sendCode(codeEmail), "The code couldn't be sent. Please try again.", () => {
      setToken(''); setMessage('A new code is on its way.');
    });
  }

  return <div className="account-controls">
    <button ref={trigger} type="button" className="text-button account-trigger" disabled={state.loading} onClick={open}>{state.user ? 'Account' : 'Sign in'}</button>
    {state.user && <span className="account-sync-state" data-status={state.status} role="status" aria-label="Sync status">{status}</span>}
    <dialog ref={dialog} className="account-dialog" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}>
      <div className="account-dialog-header"><h2 id={titleId}>{state.user ? 'Your account' : 'Sign in'}</h2><button className="account-close" type="button" aria-label="Close account" onClick={close}><span aria-hidden="true">×</span></button></div>
      {state.user ? <div className="account-dialog-content">
        <p className="account-email">{state.user.email}</p><p className="account-status">{status}</p>
        <button className="primary" type="button" disabled={disabled || state.status === 'syncing'} onClick={() => void perform(() => runtime.sync(), "Sync couldn't finish. Please try again.")}>Sync now</button>
        <div className="account-copy"><p>Add this device's local practice and card notes to this account. The local copy stays here.</p><button className="account-secondary" type="button" disabled={disabled} onClick={() => void perform(() => runtime.copyGuestProgress(), "The progress couldn't be copied. Please try again.", () => setMessage('Copied into this account.'))}>Copy this device's progress</button></div>
        <button className="text-button" type="button" disabled={disabled} onClick={() => void perform(() => runtime.signOut(), "Sign out couldn't finish. Please try again.", finishAuthentication)}>Sign out</button>
      </div> : step === 'email' ? <form className="account-form" onSubmit={send}>
        <label>Email<input ref={emailInput} name="email" type="email" inputMode="email" autoComplete="email" required value={email} disabled={disabled} onChange={event => setEmail(event.target.value)}/></label>
        <button className="primary" type="submit" disabled={disabled}>{busy ? 'Sending…' : 'Send code'}</button>
      </form> : <form className="account-form" onSubmit={verify}>
        <p>Enter the code sent to <strong>{codeEmail}</strong>.</p>
        <label>Email code<input ref={codeInput} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} disabled={disabled} onChange={event => setToken(event.target.value.replace(/\D/g, '').slice(0, 10))}/></label>
        <button className="primary" type="submit" disabled={disabled || token.length < 6}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="account-code-actions"><button className="text-button" type="button" disabled={disabled} onClick={resend}>Send a new code</button><button className="text-button" type="button" disabled={disabled} onClick={() => { setStep('email'); setToken(''); setActionError(null); setMessage(null); }}>Use another email</button></div>
      </form>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {message && <p className="account-message" role="status">{message}</p>}
    </dialog>
  </div>;
}
