import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LogIn, Mail, Trash2, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { clearDeletionIntent, readDeletionIntent, verifyDeletionReadiness } from './accountDeletion';

interface AccountDeletionModalProps {
  isLightMode: boolean;
  returnedFromReauthentication: boolean;
  onClose: () => void;
}

export default function AccountDeletionModal({ isLightMode, returnedFromReauthentication, onClose }: AccountDeletionModalProps) {
  const { user, session, isDeletingAccount, reauthenticateForDeletion, deleteAccount } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = reauthenticating || isDeletingAccount;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setChecking(true);
    const intent = readDeletionIntent();
    if (!user || !intent) {
      if (returnedFromReauthentication) setError('Deletion request expired or missing. Start sign-in verification again.');
      setChecking(false);
      return;
    }
    void verifyDeletionReadiness(user.id).then(() => {
      if (!cancelled) { setReady(true); setError(null); }
    }).catch((failure: unknown) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : 'Sign-in verification is required.');
    }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [user, session?.access_token, returnedFromReauthentication]);

  const cancel = () => {
    if (pendingRef.current || pending) return;
    try { clearDeletionIntent(); } finally { onClose(); }
  };

  const reauthenticate = async (method: 'google' | 'email') => {
    if (pendingRef.current || pending) return;
    pendingRef.current = true;
    setReauthenticating(true);
    setReady(false);
    setError(null);
    setLinkSent(false);
    setConfirmation('');
    try {
      const result = await reauthenticateForDeletion(method);
      if (result.error) setError(result.error);
      else if (method === 'email') setLinkSent(true);
    } finally {
      pendingRef.current = false;
      setReauthenticating(false);
    }
  };

  const confirmDeletion = async () => {
    if (pendingRef.current || pending || !ready || confirmation !== 'DELETE') return;
    pendingRef.current = true;
    setError(null);
    try {
      const result = await deleteAccount(confirmation);
      if (result.error) {
        setError(result.error);
        setConfirmation('');
        setReady(false);
      } else {
        onClose();
      }
    } finally {
      pendingRef.current = false;
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="account-deletion-title"
      aria-describedby="account-deletion-description"
      aria-busy={pending}
      onCancel={(event) => { event.preventDefault(); cancel(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); cancel(); }
      }}
      className={`fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border p-5 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm ${
        isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-white/10 text-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="account-deletion-title" className={`flex items-center gap-2 text-base font-semibold ${isLightMode ? 'text-red-700' : 'text-red-300'}`}>
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Permanently delete account
        </h2>
        <button type="button" onClick={cancel} disabled={pending} aria-label="Cancel account deletion" title="Cancel account deletion"
          className="shrink-0 rounded-lg p-1.5 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 break-all text-sm font-semibold">{user?.email || user?.id}</p>
      <div id="account-deletion-description" className={`mt-3 space-y-2 text-sm leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-white/75'}`}>
        <p>This permanently deletes your app account, saved location, and all server push subscriptions on every device. This cannot be undone.</p>
        <p>Your Google account and public brownout schedules will not be deleted.</p>
      </div>
      <div className="mt-5 space-y-3">
        {checking ? <p role="status" className="text-sm">Checking sign-in verification...</p> : ready ? (
          <p role="status" className={`text-sm ${isLightMode ? 'text-emerald-700' : 'text-emerald-300'}`}>Recent sign-in verified for this account.</p>
        ) : (
          <>
            <p className="text-sm">Sign in again to verify this account before continuing.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void reauthenticate('google')} disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-sm font-medium hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Verify with Google
              </button>
              {user?.email && <button type="button" onClick={() => void reauthenticate('email')} disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-sm font-medium hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50">
                <Mail className="h-4 w-4" aria-hidden="true" /> Send email link
              </button>}
            </div>
          </>
        )}
        {reauthenticating && <p role="status" className="text-sm">Starting sign-in verification...</p>}
        {linkSent && <p role="status" className="break-words text-sm">Verification link sent to {user?.email}. Return through that link to confirm deletion.</p>}
        {error && <p role="alert" className={`text-sm ${isLightMode ? 'text-red-700' : 'text-red-300'}`}>{error}</p>}
        <div>
          <label htmlFor="account-deletion-confirmation" className="mb-1.5 block text-sm font-medium">Type DELETE to confirm</label>
          <input id="account-deletion-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending || !ready} autoComplete="off" spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 ${isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/20'}`} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={cancel} disabled={pending}
          className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50">Cancel</button>
        <button type="button" onClick={() => void confirmDeletion()} disabled={pending || checking || !ready || confirmation !== 'DELETE'}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-50">
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isDeletingAccount ? 'Deleting account...' : 'Permanently delete'}
        </button>
      </div>
    </dialog>, document.body,
  );
}