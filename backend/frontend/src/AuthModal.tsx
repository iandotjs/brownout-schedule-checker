import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Loader2,
  AlertCircle,
  Zap,
  ArrowRight,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from './AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLightMode: boolean;
}

export default function AuthModal({ isOpen, onClose, isLightMode }: AuthModalProps) {
  const { signInWithGoogle, signInWithMagicLink } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await signInWithMagicLink(email.trim());
      if (err) {
        setError(err);
      } else {
        setMagicLinkSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

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

  const resetState = () => {
    setEmail('');
    setError(null);
    setSubmitting(false);
    setMagicLinkSent(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // --- Shared style tokens ---
  const inputBase = `w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-150 focus:ring-2 ${
    isLightMode
      ? 'bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-200 focus:bg-white'
      : 'bg-white/6 border border-white/10 text-white placeholder:text-white/30 focus:border-yellow-400/50 focus:ring-yellow-400/10'
  }`;

  const labelBase = `block text-xs font-medium mb-1.5 ${
    isLightMode ? 'text-slate-500' : 'text-white/50'
  }`;

  const primaryBtn = `w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
    isLightMode
      ? 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-900 focus-visible:ring-offset-white'
      : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300 focus-visible:ring-yellow-400 focus-visible:ring-offset-slate-900'
  }`;

  const socialBtn = `flex items-center justify-center w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed border gap-3 ${
    isLightMode
      ? 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400 focus-visible:ring-offset-white shadow-sm hover:shadow'
      : 'bg-white/6 text-white border-white/10 hover:bg-white/10 hover:border-white/20 focus-visible:ring-white/30 focus-visible:ring-offset-slate-900'
  }`;

  const mutedText = isLightMode ? 'text-slate-400' : 'text-white/30';

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

            {/* Close button */}
            <div className="absolute top-4 right-4 z-10 sm:top-5 sm:right-5">
              <button
                onClick={handleClose}
                aria-label="Close"
                className={`p-1.5 rounded-lg transition-colors ${
                  isLightMode
                    ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/8'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Header */}
            <div className="px-6 pt-6 pb-2 text-center">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                  isLightMode ? 'bg-amber-100 text-amber-600' : 'bg-yellow-400/15 text-yellow-400'
                }`}
              >
                <Zap className="w-5 h-5" fill="currentColor" />
              </div>
              <h2 className={`text-lg font-bold leading-tight ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                {magicLinkSent ? 'Check your inbox' : 'Sign in'}
              </h2>
              <p className={`text-sm mt-1 ${mutedText}`}>
                {magicLinkSent
                  ? 'We sent a magic link to your email'
                  : 'Sign in to receive scheduled brownout alerts'}
              </p>
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
                {magicLinkSent ? (
                  /* ── Magic link sent confirmation ── */
                  <motion.div
                    key="sent"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4 text-center"
                  >
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                        isLightMode ? 'bg-emerald-50 text-emerald-500' : 'bg-emerald-400/10 text-emerald-400'
                      }`}
                    >
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/80'}`}>
                        {email}
                      </p>
                      <p className={`text-xs mt-1.5 leading-relaxed ${mutedText}`}>
                        Click the link in the email to sign in. If you don't see it, check your spam folder.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMagicLinkSent(false)}
                      className={`text-xs font-semibold transition-colors duration-150 ${
                        isLightMode
                          ? 'text-slate-700 hover:text-slate-900'
                          : 'text-yellow-400 hover:text-yellow-300'
                      }`}
                    >
                      Use a different email
                    </button>
                  </motion.div>
                ) : (
                  /* ── Sign-in options ── */
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    {/* Google — full width button */}
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={submitting}
                      className={socialBtn}
                      aria-label="Continue with Google"
                    >
                      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className={`flex-1 h-px ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
                      <span className={`text-xs font-medium ${mutedText}`}>or</span>
                      <div className={`flex-1 h-px ${isLightMode ? 'bg-slate-200' : 'bg-white/10'}`} />
                    </div>

                    {/* Email magic link form */}
                    <form onSubmit={handleMagicLink} className="space-y-3">
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
                          required
                        />
                      </div>

                      <button type="submit" disabled={submitting || !email.trim()} className={primaryBtn}>
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            Sign in with email
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </form>
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
