import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Building2, Zap, Calendar, Clock, CheckCircle2, AlertCircle, Info, Sun, Moon, MessageSquarePlus, Shield } from 'lucide-react';
import localLocations from './locations.json';
import { Analytics } from '@vercel/analytics/react';
import { useAuth } from './AuthContext';
import AuthModal from './AuthModal';
import NotificationBanner from './NotificationBanner';

interface Location {
  code: string;
  name: string;
  barangays: { code: string; name: string }[];
}

interface Notice {
  id: string;
  title: string;
  url: string;
  created_at: string;
  data: any;
}

interface MatchedSchedule {
  id: string;
  url: string;
  locationStr: string;
  dateStr: string;
  timeStr: string;
  affectedArea: string | null;
}

type MunicipalityValue = { code?: string | null; name?: string | null } | string | null | undefined;
type BarangayValue = { code?: string | null; name?: string | null } | string | null | undefined;
type ThemeMode = 'light' | 'dark';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || '';

const normalizeLocations = (data: unknown): Location[] => {
  if (Array.isArray(data)) {
    return data as Location[];
  }

  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, string[]>).map(([city, barangays], idx) => ({
      code: `CITY-${idx}`,
      name: city,
      barangays: barangays.map((b, i) => ({
        code: `BRGY-${idx}-${i}`,
        name: b,
      })),
    }));
  }

  return [];
};

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const matchesMunicipality = (
  municipality: MunicipalityValue,
  selectedCityCode: string,
  selectedCityName: string
): boolean => {
  if (!municipality) return false;

  const selectedCode = String(selectedCityCode || '').trim();
  const selectedName = normalizeText(selectedCityName);

  if (typeof municipality === 'string') {
    const muniValue = municipality.trim();
    return muniValue === selectedCode || normalizeText(muniValue) === selectedName;
  }

  const muniCode = String(municipality.code ?? '').trim();
  const muniName = normalizeText(municipality.name ?? '');
  return muniCode === selectedCode || muniName === selectedName;
};

const matchesBarangay = (
  barangay: BarangayValue,
  selectedBarangayCode: string,
  selectedBarangayName: string
): boolean => {
  if (!barangay) return false;

  const selectedCode = String(selectedBarangayCode || '').trim();
  const selectedName = normalizeText(selectedBarangayName);

  if (typeof barangay === 'string') {
    const brgyValue = barangay.trim();
    return brgyValue === selectedCode || normalizeText(brgyValue) === selectedName;
  }

  const brgyCode = String(barangay.code ?? '').trim();
  const brgyName = normalizeText(barangay.name ?? '');
  return brgyCode === selectedCode || brgyName === selectedName;
};

const fetchNoticesFromSupabase = async (): Promise<Notice[]> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return [];
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/notices`);
  url.searchParams.set('select', 'id,title,url,created_at,data,status');
  url.searchParams.set('status', 'eq.active');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '20');

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase request failed: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export default function App() {
  // Dev-only crash test: open /?crash=1 to trigger the ErrorBoundary maintenance page
  // if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('crash') === '1') {
  //   throw new Error('Manual crash test');
  // }

  const [locations] = useState<Location[]>(normalizeLocations(localLocations));
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [useLowPowerVisuals, setUseLowPowerVisuals] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { profile, loading: authLoading } = useAuth();

  // Auto-set saved default location when profile loads
  useEffect(() => {
    if (!authLoading && profile?.default_city && profile?.default_barangay) {
      // Only auto-set if user hasn't already manually selected something
      if (!selectedCity && !selectedBarangay) {
        setSelectedCity(profile.default_city);
        setSelectedBarangay(profile.default_barangay);
      }
    }
  }, [authLoading, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 640px)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateVisualMode = () => {
      setUseLowPowerVisuals(mobileQuery.matches || reducedMotionQuery.matches);
    };

    updateVisualMode();
    mobileQuery.addEventListener('change', updateVisualMode);
    reducedMotionQuery.addEventListener('change', updateVisualMode);

    return () => {
      mobileQuery.removeEventListener('change', updateVisualMode);
      reducedMotionQuery.removeEventListener('change', updateVisualMode);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  const isAdmin = ADMIN_KEY && new URLSearchParams(window.location.search).get('admin') === ADMIN_KEY;

  // Maintenance mode state
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Locations are bundled so dropdown works without backend runtime dependencies.

  // Fetch notices directly from Supabase
  const loadNotices = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Check maintenance mode
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const maintUrl = new URL(`${SUPABASE_URL}/rest/v1/app_settings`);
          maintUrl.searchParams.set('select', 'value');
          maintUrl.searchParams.set('key', 'eq.maintenance_mode');
          const maintRes = await fetch(maintUrl.toString(), {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          });
          if (maintRes.ok) {
            const maintData = await maintRes.json();
            if (Array.isArray(maintData) && maintData.length > 0 && maintData[0].value === 'true') {
              if (!isAdmin) {
                setMaintenanceMode(true);
                setLoading(false);
                return;
              }
            }
          }
        } catch {
          // non-critical
        }
      }

      const supabaseNotices = await fetchNoticesFromSupabase();
      setNotices(supabaseNotices);
      // Derive last-updated timestamp from the most recent notice
      if (supabaseNotices.length > 0) {
        const latest = supabaseNotices.reduce((a, b) =>
          (a.created_at ?? '') > (b.created_at ?? '') ? a : b
        );
        if (latest.created_at) {
          setLastUpdated(
            new Date(latest.created_at).toLocaleString('en-PH', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit', hour12: true,
            })
          );
        }
      }
    } catch (err) {
      console.error('Error fetching notices from Supabase:', err);
      setNotices([]);
      setLoadError('Unable to load latest schedules right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotices();
  }, []);

  const availableBarangays = useMemo(() => {
    const city = locations.find(c => c.code === selectedCity);
    return city ? city.barangays : [];
  }, [locations, selectedCity]);

  // Filter schedules and flatten them exactly to specific dates/times
  const matchedSchedules = useMemo(() => {
    if (!selectedCity || !selectedBarangay) return null;

    const selectedCityObj = locations.find((l) => l.code === selectedCity);
    const selectedCityName = selectedCityObj?.name || '';
    const selectedBarangayName =
      selectedCityObj?.barangays.find((b) => b.code === selectedBarangay)?.name || '';
    
    const matches: MatchedSchedule[] = [];

    notices.forEach((n) => {
      if (!n.data?.processed_images) return;
      
      n.data.processed_images.forEach((img: any) => {
        if (!Array.isArray(img.structured)) return;
        
        img.structured.forEach((s: any) => {
          let hasMatch = false;
          let matchedLocStr = "";
          
          let matchedAffectedArea: string | null = null;

          s.locations?.forEach((loc: any) => {
            if (matchesMunicipality(loc.municipality, selectedCity, selectedCityName)) {
              loc.barangays?.forEach((b: any) => {
                if (matchesBarangay(b, selectedBarangay, selectedBarangayName)) {
                  hasMatch = true;
                  const cityName =
                    selectedCityName ||
                    String((typeof loc.municipality === 'object' && loc.municipality?.name) || loc.municipality || '');
                  const brgyName =
                    selectedBarangayName ||
                    String((typeof b === 'object' && b?.name) || b || '');
                  matchedLocStr = `${brgyName}, ${cityName}`;
                  if (typeof b === 'object' && b?.affected_area) {
                    matchedAffectedArea = b.affected_area;
                  }
                }
              });
            }
          });

          if (hasMatch) {
            matches.push({
               id: n.id + '-' + Math.random().toString(36).substring(7),
               url: n.url,
               dateStr: Array.isArray(s.dates) && s.dates.length > 0 ? s.dates.join(", ") : new Date(n.created_at).toLocaleDateString(),
               timeStr: Array.isArray(s.times) && s.times.length > 0 ? s.times.join(", ") : "See official notice",
               locationStr: matchedLocStr,
               affectedArea: matchedAffectedArea
            });
          }
        });
      });
    });
    
    return matches;
  }, [notices, selectedCity, selectedBarangay, locations]);

  const handleCityChange = (cityCode: string) => {
    setSelectedCity(cityCode);
    setSelectedBarangay('');
  };

  const isLightMode = themeMode === 'light';
  const containerBgClass = isLightMode
    ? 'bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100'
    : 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900';
  const cardClass = isLightMode
    ? 'bg-white/70 border border-amber-200/70 shadow-2xl shadow-amber-200/40'
    : 'bg-white/10 border border-white/20 shadow-2xl';
  const sectionTextClass = isLightMode ? 'text-slate-800' : 'text-white';
  const mutedTextClass = isLightMode ? 'text-slate-600' : 'text-white/60';
  const fieldClass = isLightMode
    ? 'w-full px-4 py-3 md:px-5 md:py-4 text-sm md:text-base bg-white/80 border border-amber-200 rounded-xl md:rounded-2xl text-slate-800 appearance-none cursor-pointer focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-300 hover:bg-white hover:shadow-md'
    : 'w-full px-4 py-3 md:px-5 md:py-4 text-sm md:text-base bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl md:rounded-2xl text-white appearance-none cursor-pointer focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:bg-white/20 transition-all duration-300 hover:bg-white/15 hover:shadow-md hover:shadow-black/10';
  const panelClass = isLightMode
    ? 'relative bg-white/80 border border-amber-200/70'
    : 'relative bg-white/10 backdrop-blur-sm border border-white/20';

  if (loadError) {
    return (
      <div className={`min-h-screen w-full flex items-center justify-center p-6 transition-colors duration-500 ${containerBgClass}`}>
        <div className={`w-full max-w-xl rounded-3xl p-8 text-center backdrop-blur-xl ${cardClass}`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-7 w-7 text-red-300" />
          </div>
          <h1 className={`text-2xl font-bold ${sectionTextClass}`}>Maintenance in progress</h1>
          <p className={`mt-3 text-sm ${mutedTextClass}`}>
            {loadError} Please try reloading. If this continues, check back in a few minutes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void loadNotices()}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-300 transition-colors"
            >
              Try Again
            </button>
            <a
              href="https://zaneco.ph"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${isLightMode ? 'border-slate-300 text-slate-700 hover:bg-white/70' : 'border-white/20 text-white hover:bg-white/10'}`}
            >
              Official Site
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (maintenanceMode) {
    return (
      <div className={`min-h-screen w-full flex items-center justify-center p-6 transition-colors duration-500 ${containerBgClass}`}>
        <div className={`w-full max-w-xl rounded-3xl p-8 text-center backdrop-blur-xl ${cardClass}`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/20">
            <AlertCircle className="h-7 w-7 text-yellow-400" />
          </div>
          <h1 className={`text-2xl font-bold ${sectionTextClass}`}>Maintenance in progress</h1>
          <p className={`mt-3 text-sm ${mutedTextClass}`}>
            We're performing scheduled maintenance. Please check back shortly.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => { setMaintenanceMode(false); void loadNotices(); }}
              className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-300 transition-colors"
            >
              Try Again
            </button>
            <a
              href="https://zaneco.ph"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${isLightMode ? 'border-slate-300 text-slate-700 hover:bg-white/70' : 'border-white/20 text-white hover:bg-white/10'}`}
            >
              Official Site
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`size-full relative overflow-hidden min-h-screen flex flex-col transition-colors duration-500 ${containerBgClass}`}>
      {/* City skyline silhouette */}
      <div className={`absolute bottom-0 left-0 right-0 h-64 z-0 ${isLightMode ? 'bg-gradient-to-t from-amber-200/30 to-transparent' : 'bg-gradient-to-t from-black/80 to-transparent'}`}>
        <svg className={`absolute bottom-0 w-full h-48 ${isLightMode ? 'text-amber-400/25' : 'text-black/60'}`} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,192L48,176C96,160,192,128,288,128C384,128,480,160,576,165.3C672,171,768,149,864,154.7C960,160,1056,192,1152,186.7C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>

      {/* Electric grid lines */}
      <div className="absolute inset-0 opacity-10 z-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: isLightMode
            ? 'linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.2) 1px, transparent 1px)'
            : 'linear-gradient(rgba(251, 191, 36, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(251, 191, 36, 0.3) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Animated electric orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {!useLowPowerVisuals ? (
          <>
            <motion.div
              className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl ${isLightMode ? 'bg-amber-300/40' : 'bg-yellow-400/30'}`}
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className={`absolute top-20 right-20 w-72 h-72 rounded-full blur-3xl ${isLightMode ? 'bg-sky-300/35' : 'bg-cyan-400/20'}`}
              animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className={`absolute bottom-40 left-1/3 w-80 h-80 rounded-full blur-3xl ${isLightMode ? 'bg-emerald-300/30' : 'bg-blue-500/20'}`}
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.3, 0.2] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        ) : (
          <div className={`absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl ${isLightMode ? 'bg-amber-300/30' : 'bg-yellow-400/20'}`} />
        )}
      </div>

      {/* Electric sparks/particles */}
      <div className="pointer-events-none z-0">
        {[...Array(useLowPowerVisuals ? 10 : 30)].map((_, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full ${isLightMode ? 'bg-emerald-400' : 'bg-yellow-400'}`}
            style={{
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={useLowPowerVisuals ? { opacity: 0.25 } : { opacity: [0, 1, 0], scale: [0, 1, 0] }}
            transition={
              useLowPowerVisuals
                ? { duration: 0 }
                : { duration: Math.random() * 2 + 1, repeat: Infinity, delay: Math.random() * 3 }
            }
          />
        ))}
      </div>

      {/* Lightning strikes for brownout theme */}
      {!useLowPowerVisuals && !isLightMode && (
      <div className="pointer-events-none z-0">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={`lightning-${i}`}
            className="absolute w-0.5 bg-gradient-to-b from-yellow-200 via-yellow-400 to-transparent"
            style={{
              left: `${20 + i * 30}%`,
              top: 0,
              height: '40%',
              filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.8))',
            }}
            animate={{ opacity: [0, 1, 0], scaleY: [0, 1, 1, 0] }}
            transition={{ duration: 0.3, repeat: Infinity, repeatDelay: Math.random() * 8 + 4, delay: i * 2 }}
          />
        ))}
      </div>
      )}

      {/* Soft sunlight glow for electricity theme */}
      {!useLowPowerVisuals && isLightMode && (
        <div className="pointer-events-none z-0 absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -top-44 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-gradient-to-b from-amber-200/45 via-yellow-200/20 to-transparent blur-3xl"
            animate={{ opacity: [0.35, 0.6, 0.35], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 w-full flex-grow flex flex-col items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-2xl"
        >
          {/* Glassmorphic Card */}
          <div className={`backdrop-blur-xl rounded-3xl overflow-hidden pointer-events-auto transition-colors duration-500 ${cardClass}`}>
            {/* Header with gradient */}
            <div className={`relative p-8 md:p-10 ${isLightMode ? 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-500' : 'bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500'}`}>
              <div className="absolute right-4 top-4 flex items-center gap-1.5">
                {isAdmin && (
                  <a
                    href={`/admin?admin=${ADMIN_KEY}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${isLightMode ? 'bg-white/80 text-slate-700 hover:bg-white' : 'bg-black/30 text-white hover:bg-black/40'}`}
                    title="Admin Panel"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </a>
                )}
                <button
                  onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${isLightMode ? 'bg-white/80 text-slate-700 hover:bg-white' : 'bg-black/30 text-white hover:bg-black/40'}`}
                  title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
                  type="button"
                >
                  {isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isLightMode ? 'Dark Mode' : 'Light Mode'}</span>
                </button>
              </div>
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-center gap-3"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Zap className="w-8 h-8 text-white" fill="currentColor" />
                </motion.div>
                <h1 className="text-white text-center text-2xl font-bold tracking-tight m-0 p-0 border-0">ZN Scheduled Brownout Checker</h1>
              </motion.div>
            </div>

            {/* Form Section */}
            <div className="p-8 md:p-10 space-y-6">
              {/* Notification CTA / User Panel */}
              <NotificationBanner
                isLightMode={isLightMode}
                onLoginClick={() => setShowAuthModal(true)}
                locations={locations}
                selectedCity={selectedCity}
                selectedBarangay={selectedBarangay}
              />

              {/* City Selector */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <label htmlFor="city" className={`flex items-center gap-2 mb-3 font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                  <Building2 className="w-4 h-4" />
                  City / Municipality
                </label>
                <div className="relative group">
                  <select
                    id="city"
                    value={selectedCity}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="" className={isLightMode ? 'bg-white text-slate-800' : 'bg-gray-900'}>Select a city</option>
                    {locations.map((loc) => (
                      <option key={loc.code} value={loc.code} className={isLightMode ? 'bg-white text-slate-800 border-none' : 'bg-gray-900 border-none'}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <div className={`absolute right-3 md:right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300 ${isLightMode ? 'text-slate-400 group-hover:text-amber-500' : 'text-white/40 group-hover:text-yellow-400'}`}>
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </motion.div>

              {/* Barangay Selector */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <label htmlFor="barangay" className={`flex items-center gap-2 mb-3 font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                  <MapPin className="w-4 h-4" />
                  Barangay
                </label>
                <div className="relative group">
                  <select
                    id="barangay"
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    disabled={!selectedCity}
                    className={`${fieldClass} disabled:opacity-50 disabled:cursor-not-allowed ${isLightMode ? 'disabled:hover:bg-white/80' : 'disabled:hover:bg-white/10'}`}
                  >
                    <option value="" className={isLightMode ? 'bg-white text-slate-800' : 'bg-gray-900'}>Select a barangay</option>
                    {availableBarangays.map((barangay) => (
                      <option key={barangay.code} value={barangay.code} className={isLightMode ? 'bg-white text-slate-800 border-none' : 'bg-gray-900 border-none'}>
                        {barangay.name}
                      </option>
                    ))}
                  </select>
                  <div className={`absolute right-3 md:right-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300 ${isLightMode ? 'text-slate-400 group-hover:text-amber-500' : 'text-white/40 group-hover:text-yellow-400'}`}>
                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </motion.div>

              {/* Status or Results Section */}              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="mt-8 text-center"
                  >
                     <p className={mutedTextClass}>Scanning schedules from ZANECO...</p>
                  </motion.div>
                ) : matchedSchedules !== null && (
                  <motion.div
                    key={matchedSchedules.length === 0 ? 'no-schedule' : 'has-schedule'}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="mt-8"
                  >
                    {matchedSchedules.length === 0 ? (
                      <motion.div
                        className={`overflow-hidden backdrop-blur-sm rounded-2xl p-6 ${isLightMode ? 'bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300/70' : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30'}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-start gap-4">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring" }}
                          >
                            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                          </motion.div>
                          <p className={`font-medium ${isLightMode ? 'text-emerald-800' : 'text-emerald-100'}`}>
                            Great news! No scheduled brownout in your area.
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="space-y-4">
                        <div className={`flex items-center gap-2 ${isLightMode ? 'text-orange-700' : 'text-orange-300'}`}>
                          <AlertCircle className="w-5 h-5" />
                          <span className="text-sm font-semibold">Scheduled brownouts found</span>
                        </div>
                        <div className="space-y-3">
                          {matchedSchedules.map((schedule, index) => (
                            <motion.div
                              key={schedule.id || index}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className={`${panelClass} rounded-2xl p-5 transition-all duration-300 group ${isLightMode ? 'hover:bg-white' : 'hover:bg-white/15'}`}
                            >
                              <a 
                                href={schedule.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className={`absolute top-4 right-4 transition-colors ${isLightMode ? 'text-slate-500 hover:text-slate-800' : 'text-white/50 hover:text-white'}`}
                                title="View the official notice details"
                              >
                                <Info className="w-5 h-5" />
                              </a>
                              <div className="space-y-3 pr-8">
                                <div className="flex items-start gap-3">
                                  <MapPin className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <div className={`text-xs mb-1 ${mutedTextClass}`}>Location</div>
                                    <div className={`text-sm font-medium ${sectionTextClass}`}>
                                      {schedule.locationStr}
                                    </div>
                                  </div>
                                </div>
                                {schedule.affectedArea && (
                                  <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <div className={`text-xs mb-1 ${mutedTextClass}`}>Affected Area</div>
                                      <div className={`text-sm font-medium break-words ${sectionTextClass}`}>
                                        {schedule.affectedArea}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="flex items-start gap-3">
                                    <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <div className={`text-xs mb-1 ${mutedTextClass}`}>Date</div>
                                      <div className={`text-sm font-medium break-words ${sectionTextClass}`}>
                                        {schedule.dateStr}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-3">
                                    <Clock className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <div className={`text-xs mb-1 ${mutedTextClass}`}>Time</div>
                                      <div className={`text-sm font-medium break-words ${sectionTextClass}`}>
                                        {schedule.timeStr}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Report & Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-6 mb-4 text-center"
        >
          <a
            href="/report"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isLightMode ? 'bg-white/80 text-cyan-700 border border-cyan-300 hover:bg-white' : 'bg-white/10 text-yellow-400 border border-yellow-400/30 hover:bg-white/15'}`}
          >
            <MessageSquarePlus className="w-4 h-4" />
            Report & Feedback
          </a>
        </motion.div>

        {/* Attribution Footer */}
        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`mt-2 flex flex-col items-center gap-1.5 text-center text-sm ${isLightMode ? 'text-slate-500' : 'text-white/40'}`}
        >
          <p className={isLightMode ? 'text-slate-600' : 'text-white/50'}>
            Data sourced from official ZANECO announcements.
          </p>
          {lastUpdated && (
            <p className="text-xs opacity-60">Data last updated: {lastUpdated}</p>
          )}
          {/* <p className="mt-3 text-sm opacity-30 transition-opacity hover:opacity-60" style={{ fontFamily: "'Dancing Script', cursive" }}>
            Made by{' '}
            <a
              href="https://github.com/iandotjs"
              target="_blank"
              rel="noopener noreferrer"
              className={`${isLightMode ? 'text-slate-500 hover:text-slate-700' : 'text-white/40 hover:text-white/70'} transition-colors`}
            >
              @iandotjs
            </a>
          </p> */}
        </motion.footer>


      </div>
    <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} isLightMode={isLightMode} />
    <Analytics />
    </div>
  );
}
