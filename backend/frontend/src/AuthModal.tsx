import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Loader2,
  AlertCircle,
  Zap,
  Mail,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from './AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLightMode: boolean;
}

type Tab = 'email' | 'phone' | 'google';
type AuthMode = 'signin' | 'register';

export default function AuthModal({ isOpen, onClose, isLightMode }: AuthModalProps) {
  const { signInWithGoogle } = useAuth();

  const [tab, setTab] = useState<Tab>('email');
  const [mode, setMode] = useState<AuthMode>('signin');
  const [showPassword, setShowPassword] = useState(false);

  // Email form state (placeholder)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Phone form state (placeholder)
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await signInWithGoogle();
      if (err) setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Placeholder submit handlers
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire up email auth
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire up OTP send
    setOtpSent(true);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire up OTP verify
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setShowPassword(false);
    setConfirmPassword('');
    setDisplayName('');
    setOtpSent(false);
    setOtp('');
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setOtpSent(false);
    setOtp('');
  };

  // --- Shared style tokens ---
  const inputBase = `w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-150 focus:ring-2 ${
    isLightMode
      ? 'bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-200 focus:bg-white'
      : 'bg-white/6 border border-white/10 text-white placeholder:text-white/30 focus:border-yellow-400/50 focus:ring-yellow-400/10'
  }`;

  const labelBase = `block text-xs font-medium mb-1.5 ${
    isLightMode ? 'text-slate-500' : 'text-white/50'
  }`;

  const primaryBtn = `w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
    isLightMode
      ? 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-900 focus-visible:ring-offset-white'
      : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300 focus-visible:ring-yellow-400 focus-visible:ring-offset-slate-900'
  }`;

  const ghostBtn = `text-xs font-medium transition-colors duration-150 ${
    isLightMode
      ? 'text-slate-400 hover:text-slate-700'
      : 'text-white/35 hover:text-white/70'
  }`;

  const dividerColor = isLightMode ? 'border-slate-100' : 'border-white/8';
  const mutedText = isLightMode ? 'text-slate-400' : 'text-white/30';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'email', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
    { id: 'phone', label: 'Phone', icon: <Phone className="w-3.5 h-3.5" /> },
    {
      id: 'google',
      label: 'Google',
      icon: (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ),
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`absolute inset-0 ${isLightMode ? 'bg-black/25' : 'bg-black/70'} backdrop-blur-sm`}
            onClick={onClose}
          />

          {/* Sheet / Modal */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className={`relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden ${
              isLightMode
                ? 'bg-white border border-slate-200 shadow-2xl shadow-slate-300/50'
                : 'bg-slate-900 border border-white/10 shadow-2xl shadow-black/60'
            }`}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className={`w-10 h-1 rounded-full ${isLightMode ? 'bg-slate-200' : 'bg-white/15'}`} />
            </div>

            {/* Header */}
            <div className={`px-6 pt-5 pb-4 flex items-start justify-between border-b ${dividerColor}`}>
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isLightMode ? 'bg-amber-100 text-amber-600' : 'bg-yellow-400/15 text-yellow-400'
                  }`}
                >
                  <Zap className="w-4 h-4" fill="currentColor" />
                </div>
                <div>
                  <h2 className={`text-sm font-semibold leading-tight ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </h2>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    Save your location &amp; receive brownout alerts
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className={`mt-0.5 p-1.5 rounded-lg transition-colors ${
                  isLightMode
                    ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/8'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Bar */}
            <div className={`px-6 pt-4 pb-0 flex gap-1 border-b ${dividerColor}`}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors duration-150 focus:outline-none ${
                    tab === t.id
                      ? isLightMode
                        ? 'text-slate-800'
                        : 'text-white'
                      : isLightMode
                        ? 'text-slate-400 hover:text-slate-600'
                        : 'text-white/35 hover:text-white/60'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {tab === t.id && (
                    <motion.div
                      layoutId="tab-indicator"
                      className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                        isLightMode ? 'bg-slate-900' : 'bg-yellow-400'
                      }`}
                      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl text-xs leading-relaxed ${
                      isLightMode
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-red-500/10 text-red-300 border border-red-400/20'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {/* ── Email Tab ── */}
                {tab === 'email' && (
                  <motion.form
                    key="email"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.18 }}
                    onSubmit={handleEmailSubmit}
                    className="space-y-3"
                  >
                    {mode === 'register' && (
                      <div>
                        <label htmlFor="displayName" className={labelBase}>Full name</label>
                        <input
                          id="displayName"
                          type="text"
                          autoComplete="name"
                          placeholder="Juan dela Cruz"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className={inputBase}
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="email" className={labelBase}>Email address</label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputBase}
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className={labelBase}>Password</label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                          placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={`${inputBase} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                            isLightMode ? 'text-slate-400 hover:text-slate-600' : 'text-white/25 hover:text-white/50'
                          }`}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {mode === 'register' && (
                      <div>
                        <label htmlFor="confirmPassword" className={labelBase}>Confirm password</label>
                        <input
                          id="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Re-enter your password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={inputBase}
                        />
                      </div>
                    )}

                    <button type="submit" disabled={submitting} className={`${primaryBtn} mt-1`}>
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          {mode === 'signin' ? 'Sign in' : 'Create account'}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-1.5 pt-0.5">
                      <span className={`text-xs ${mutedText}`}>
                        {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}
                        className={ghostBtn}
                      >
                        {mode === 'signin' ? 'Register' : 'Sign in'}
                      </button>
                    </div>
                  </motion.form>
                )}

                {/* ── Phone Tab ── */}
                {tab === 'phone' && (
                  <motion.div
                    key="phone"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    <AnimatePresence mode="wait">
                      {!otpSent ? (
                        <motion.form
                          key="phone-input"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          onSubmit={handleSendOtp}
                          className="space-y-3"
                        >
                          <div>
                            <label htmlFor="phone" className={labelBase}>Mobile number</label>
                            <div className="flex gap-2">
                              <div
                                className={`flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium flex-shrink-0 border ${
                                  isLightMode
                                    ? 'bg-slate-50 border-slate-200 text-slate-500'
                                    : 'bg-white/6 border-white/10 text-white/50'
                                }`}
                              >
                                <span className="text-base leading-none">🇵🇭</span>
                                <span>+63</span>
                              </div>
                              <input
                                id="phone"
                                type="tel"
                                autoComplete="tel-national"
                                placeholder="9XX XXX XXXX"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className={inputBase}
                              />
                            </div>
                          </div>

                          <button type="submit" disabled={submitting} className={primaryBtn}>
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                Send OTP
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>

                          <div className="flex items-center justify-center gap-1.5 pt-0.5">
                            <span className={`text-xs ${mutedText}`}>
                              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                            </span>
                            <button
                              type="button"
                              onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}
                              className={ghostBtn}
                            >
                              {mode === 'signin' ? 'Register' : 'Sign in'}
                            </button>
                          </div>
                        </motion.form>
                      ) : (
                        <motion.form
                          key="otp-input"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          onSubmit={handleVerifyOtp}
                          className="space-y-3"
                        >
                          <div className={`flex items-center gap-2 text-xs mb-1 ${mutedText}`}>
                            <button
                              type="button"
                              onClick={() => setOtpSent(false)}
                              className={`flex items-center gap-1 transition-colors ${
                                isLightMode ? 'hover:text-slate-600' : 'hover:text-white/60'
                              }`}
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                              Back
                            </button>
                            <span>&middot; OTP sent to +63 {phone}</span>
                          </div>

                          <div>
                            <label htmlFor="otp" className={labelBase}>One-time password</label>
                            <input
                              id="otp"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="6-digit code"
                              value={otp}
                              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              className={`${inputBase} tracking-widest text-center font-mono`}
                            />
                          </div>

                          <button type="submit" disabled={submitting || otp.length < 6} className={primaryBtn}>
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                Verify &amp; sign in
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>

                          <div className="flex items-center justify-center gap-1.5 pt-0.5">
                            <span className={`text-xs ${mutedText}`}>Didn&apos;t receive it?</span>
                            <button type="button" onClick={() => setOtp('')} className={ghostBtn}>
                              Resend OTP
                            </button>
                          </div>
                        </motion.form>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ── Google Tab ── */}
                {tab === 'google' && (
                  <motion.div
                    key="google"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    <p className={`text-xs leading-relaxed ${mutedText}`}>
                      Continue with your Google account to save your location and receive brownout alerts for your area.
                    </p>

                    <button
                      onClick={handleGoogleSignIn}
                      disabled={submitting}
                      className={`group w-full relative flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed border ${
                        isLightMode
                          ? 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400 focus-visible:ring-offset-white shadow-sm hover:shadow'
                          : 'bg-white/6 text-white border-white/10 hover:bg-white/10 hover:border-white/20 focus-visible:ring-white/30 focus-visible:ring-offset-slate-900'
                      }`}
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                          </svg>
                          Continue with Google
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className={`px-6 pb-6 sm:pb-5 text-center text-xs leading-relaxed ${mutedText}`}>
              By continuing, you agree to let us save your preferred location for brownout alerts.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
