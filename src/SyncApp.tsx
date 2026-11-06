import { useSyncExternalStore } from 'react';
import App from './App';
import { AccountPanel } from './components/AccountPanel';
import { getAccountRuntime, type AccountSnapshot } from './sync/runtime';

const runtime = getAccountRuntime();
const guest: AccountSnapshot = { loading: false, user: null, status: 'idle', error: null, revision: 0 };
const subscribeGuest = () => () => {};
const guestSnapshot = () => guest;

export default function SyncApp() {
  const state = useSyncExternalStore(runtime?.subscribe ?? subscribeGuest, runtime?.snapshot ?? guestSnapshot);
  if (!runtime) return <App/>;
  return <App key={state.user?.id ?? 'guest'} progressStore={runtime.store()} historyRevision={state.revision}
    accountLoading={state.loading} onSaved={runtime.changed} accountControls={<AccountPanel runtime={runtime} state={state}/>}/>;
}
