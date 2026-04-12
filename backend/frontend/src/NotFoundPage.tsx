import { Home, MapPinned } from 'lucide-react';

export default function NotFoundPage() {
  const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('themeMode') : null;
  const isLightMode = savedTheme === 'light';

  const pageClass = isLightMode
    ? 'min-h-screen w-full bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100 text-slate-900 flex items-center justify-center p-6'
    : 'min-h-screen w-full bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white flex items-center justify-center p-6';

  const cardClass = isLightMode
    ? 'w-full max-w-xl rounded-3xl border border-amber-200/80 bg-white/80 backdrop-blur-xl p-8 text-center shadow-2xl shadow-amber-200/40'
    : 'w-full max-w-xl rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-8 text-center shadow-2xl';

  const badgeClass = isLightMode
    ? 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-100'
    : 'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400/20';

  const codeClass = isLightMode
    ? 'text-sm font-semibold tracking-widest text-cyan-700'
    : 'text-sm font-semibold tracking-widest text-cyan-300';

  const bodyClass = isLightMode ? 'mt-3 text-sm text-slate-600' : 'mt-3 text-sm text-slate-200/85';

  const homeButtonClass = isLightMode
    ? 'inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors'
    : 'inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition-colors';

  return (
    <div className={pageClass}>
      <div className={cardClass}>
        <div className={badgeClass}>
          <MapPinned className={`h-7 w-7 ${isLightMode ? 'text-cyan-700' : 'text-cyan-300'}`} />
        </div>
        <p className={codeClass}>ERROR 404</p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className={bodyClass}>
          The page you are trying to open does not exist or may have been moved.
        </p>

        <div className="mt-6 flex items-center justify-center">
          <a
            href="/"
            className={homeButtonClass}
          >
            <Home className="h-4 w-4" />
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
