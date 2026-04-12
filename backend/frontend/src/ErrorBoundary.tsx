import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Wrench } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('UI crash captured by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('themeMode') : null;
    const isLightMode = savedTheme === 'light';

    const pageClass = isLightMode
      ? 'min-h-screen w-full bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100 text-slate-900 flex items-center justify-center p-6'
      : 'min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white flex items-center justify-center p-6';

    const cardClass = isLightMode
      ? 'w-full max-w-xl rounded-3xl border border-amber-200/80 bg-white/80 backdrop-blur-xl p-8 text-center shadow-2xl shadow-amber-200/40'
      : 'w-full max-w-xl rounded-3xl border border-amber-300/30 bg-slate-900/70 backdrop-blur-xl p-8 text-center shadow-2xl';

    const iconWrapClass = isLightMode
      ? 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-200/50'
      : 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20';

    const bodyClass = isLightMode ? 'mt-3 text-sm text-slate-600' : 'mt-3 text-sm text-slate-200/85';

    const reloadClass = isLightMode
      ? 'inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 transition-colors'
      : 'inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 transition-colors';

    const linkClass = isLightMode
      ? 'inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white/70 transition-colors'
      : 'inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition-colors';

    return (
      <div className={pageClass}>
        <div className={cardClass}>
          <div className={iconWrapClass}>
            <AlertTriangle className={`h-7 w-7 ${isLightMode ? 'text-amber-700' : 'text-amber-300'}`} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">We are under maintenance</h1>
          <p className={bodyClass}>
            The page encountered an unexpected issue. Please refresh and try again in a few moments.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className={reloadClass}
            >
              <RefreshCcw className="h-4 w-4" />
              Reload Page
            </button>
            <a
              href="https://zaneco.ph/category/power-interruption-update/"
              className={linkClass}
            >
              <Wrench className="h-4 w-4" />
              View Official Notices
            </a>
          </div>
        </div>
      </div>
    );
  }
}
