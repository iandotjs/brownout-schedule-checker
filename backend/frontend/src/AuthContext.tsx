import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

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
  signInWithGoogle: () => Promise<{ error: string | null }>;
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
    
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('default_city, default_barangay, notifications_enabled')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No profile row yet — create one
      const { data: newRow } = await supabase
        .from('user_profiles')
        .insert({ id: userId, default_city: null, default_barangay: null, notifications_enabled: false })
        .select('default_city, default_barangay, notifications_enabled')
        .single();
      setProfile(newRow ?? { default_city: null, default_barangay: null, notifications_enabled: false });
      return;
    }

    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) void fetchProfile(s.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        void fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const saveProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, ...updates }, { onConflict: 'id' });

    if (!error) {
      setProfile((prev) => prev ? { ...prev, ...updates } : null);
    }
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithGoogle, signOut, saveProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
