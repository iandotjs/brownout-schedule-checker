import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';
import { beginDeletionReauthentication, clearDeletionIntent, createAccountOperationGate, permanentlyDeleteAccount, withDeletionTimeout } from './accountDeletion';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export interface UserProfile {
  default_city: string | null;
  default_barangay: string | null;
  notifications_enabled: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  adminChecking: boolean;
  isDeletingAccount: boolean;
  accountDeletionStatus: string | null;
  captureAccountOperation: () => () => boolean;
  reauthenticateForDeletion: (method: 'google' | 'email') => Promise<{ error: string | null }>;
  deleteAccount: (confirmation: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  saveProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedToken, setCheckedToken] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [accountDeletionStatus, setAccountDeletionStatus] = useState<string | null>(null);
  const operationGate = useRef(createAccountOperationGate());
  const deletingRef = useRef(false);
  const deletedUserId = useRef<string | null>(null);
  const authEvents = useRef(0);
  const pendingAuthSession = useRef<Session | null | undefined>(undefined);
  const captureAccountOperation = useCallback(() => operationGate.current.capture(), []);
  // Only block on the first check so token refreshes don't unmount the admin panel.
  const adminChecking = !!session?.access_token && checkedToken === null;

  // UI hint only; the backend re-checks admin status on every request.
  useEffect(() => {
    const token = session?.access_token;
    if (!token || isDeletingAccount) {
      setIsAdmin(false);
      setCheckedToken(null);
      return;
    }
    let cancelled = false;
    const canContinue = captureAccountOperation();
    fetch(`${API_BASE_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!cancelled && canContinue()) setIsAdmin(res.ok); })
      .catch(() => { if (!cancelled && canContinue()) setIsAdmin(false); })
      .finally(() => { if (!cancelled && canContinue()) setCheckedToken(token); });
    return () => { cancelled = true; };
  }, [session?.access_token, isDeletingAccount, captureAccountOperation]);

  const fetchProfile = useCallback(async (userId: string) => {
    const canContinue = captureAccountOperation();
    if (!canContinue()) return;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('default_city, default_barangay, notifications_enabled')
      .eq('id', userId)
      .single();

    if (!canContinue()) return;
    if (error && error.code === 'PGRST116') {
      // No profile row yet — create one
      const { data: newRow } = await supabase
        .from('user_profiles')
        .insert({ id: userId, default_city: null, default_barangay: null, notifications_enabled: false })
        .select('default_city, default_barangay, notifications_enabled')
        .single();
      if (!canContinue()) return;
      setProfile(newRow ?? { default_city: null, default_barangay: null, notifications_enabled: false });
      return;
    }

    if (data) {
      setProfile(data);
    } else {
      setProfile(null);
    }
  }, [captureAccountOperation]);

  const applySession = useCallback((nextSession: Session | null) => {
    const accepted = nextSession?.user.id === deletedUserId.current ? null : nextSession;
    operationGate.current.setUser(accepted?.user.id ?? null);
    setSession(accepted);
    setUser(accepted?.user ?? null);
    setProfile(null);
  }, []);

  useEffect(() => {
    let disposed = false;
    const initialVersion = authEvents.current;
    const acceptSession = (s: Session | null) => {
      if (disposed || deletingRef.current || (s && s.user.id === deletedUserId.current)) return;
      applySession(s);
      if (s?.user) void fetchProfile(s.user.id);
    };
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (disposed || initialVersion !== authEvents.current || deletingRef.current) return;
      acceptSession(s);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      authEvents.current++;
      if (deletingRef.current) pendingAuthSession.current = s;
      acceptSession(s);
      if (!disposed) setLoading(false);
    });

    return () => { disposed = true; subscription.unsubscribe(); };
  }, [fetchProfile, applySession]);

  const signInWithGoogle = async () => {
    if (deletingRef.current) return { error: 'Account deletion is pending.' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  const signInWithMagicLink = async (email: string) => {
    if (deletingRef.current) return { error: 'Account deletion is pending.' };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (deletingRef.current) return;
    await supabase.auth.signOut();
    clearDeletionIntent();
    setProfile(null);
  };

  const saveProfile = async (updates: Partial<UserProfile>) => {
    const canContinue = captureAccountOperation();
    if (!user || !canContinue()) return { error: 'Account changes are unavailable.' };

    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, ...updates }, { onConflict: 'id' });

    if (!canContinue()) return { error: 'Account operation cancelled.' };
    if (!error) {
      setProfile((prev) => prev ? { ...prev, ...updates } : null);
    }
    return { error: error?.message ?? null };
  };

  const reauthenticateForDeletion = async (method: 'google' | 'email') => {
    if (!user || deletingRef.current) return { error: 'Account changes are unavailable.' };
    try {
      await beginDeletionReauthentication(user, method);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not start sign-in verification.' };
    }
  };

  const deleteAccount = async (confirmation: string) => {
    if (!user || deletingRef.current) return { error: 'Account changes are unavailable.' };
    deletingRef.current = true;
    pendingAuthSession.current = undefined;
    let deletionConfirmed = false;
    operationGate.current.suspend();
    authEvents.current++;
    setIsDeletingAccount(true);
    try {
      const result = await permanentlyDeleteAccount(user.id, confirmation, () => {
        deletionConfirmed = true;
        deletedUserId.current = user.id;
        operationGate.current.setUser(null);
        void supabase.auth.stopAutoRefresh();
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsAdmin(false);
        setCheckedToken(null);
        setAccountDeletionStatus('Your account was permanently deleted. Finishing browser cleanup...');
      });
      setAccountDeletionStatus(`Your app account was permanently deleted.${result.warning ? ` ${result.warning}` : ''}`);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Account deletion could not be verified.' };
    } finally {
      let reconciledSession: Session | null = null;
      if (!deletionConfirmed) {
        const reconciliationVersion = authEvents.current;
        try {
          const { data, error } = await withDeletionTimeout(() => supabase.auth.getSession(),
            'Session reconciliation timed out.');
          reconciledSession = reconciliationVersion !== authEvents.current || error
            ? pendingAuthSession.current ?? null : data.session;
        } catch {
          reconciledSession = pendingAuthSession.current ?? null;
        }
        applySession(reconciledSession);
      }
      deletingRef.current = false;
      operationGate.current.resume();
      setIsDeletingAccount(false);
      if (reconciledSession?.user.id !== deletedUserId.current && reconciledSession?.user) {
        void fetchProfile(reconciledSession.user.id);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, adminChecking, signInWithGoogle, signInWithMagicLink, signOut, saveProfile,
      isDeletingAccount, accountDeletionStatus, captureAccountOperation, reauthenticateForDeletion, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}
