import { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Building2, Zap, Calendar, CalendarPlus, Check, Clock, CheckCircle2, AlertCircle, ExternalLink, Share2, Sun, Moon, MessageSquarePlus, Shield } from 'lucide-react';
import { buildIcs, formatDuration, formatManilaDate, formatManilaTime, getScheduleTiming, type ScheduleTiming } from './scheduleUtils';
import localLocations from './locations.json';
import { Analytics } from '@vercel/analytics/react';
import { useAuth } from './AuthContext';
import AuthModal from './AuthModal';
import NotificationBanner from './NotificationBanner';
import LocationSearch from './LocationSearch';

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
  dates: string[];
  times: string[];
  affectedArea: string | null;
}

type MunicipalityValue = { code?: string | null; name?: string | null } | string | null | undefined;
type BarangayValue = { code?: string | null; name?: string | null } | string | null | undefined;
type ThemeMode = 'light' | 'dark';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const NOTICES_CACHE_KEY = 'cachedNotices';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Notice URLs end up in href, share text and calendar files; only allow web links
const safeHttpUrl = (value: unknown): string => {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '#';
  } catch {
    return '#';
  }
};

const normalizeLocations = (data: unknown): Location[] => {
  let result: Location[];

  if (Array.isArray(data)) {
    result = data as Location[];
  } else if (data && typeof data === 'object') {
    result = Object.entries(data as Record<string, string[]>).map(([city, barangays], idx) => ({
      code: `CITY-${idx}`,
      name: city,
      barangays: barangays.map((b, i) => ({
        code: `BRGY-${idx}-${i}`,
        name: b,
      })),
    }));
  } else {
    return [];
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  result.forEach((loc) => loc.barangays.sort((a, b) => a.name.localeCompare(b.name)));
  return result;
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

const getInitialSelection = (locations: Location[]) => {
  const params = new URLSearchParams(window.location.search);
  let city = params.get('city') ?? '';
  let barangay = params.get('brgy') ?? '';
  const fromUrl = Boolean(city);

  if (!fromUrl) {
    try {
      const saved = JSON.parse(localStorage.getItem('lastLocation') || 'null');
      city = typeof saved?.city === 'string' ? saved.city : '';
      barangay = typeof saved?.barangay === 'string' ? saved.barangay : '';
    } catch {
      // ignore corrupted storage
    }
  }

  const cityObj = locations.find((l) => l.code === city);
  if (!cityObj) return { city: '', barangay: '', fromUrl: false };
  const validBarangay = cityObj.barangays.some((b) => b.code === barangay);
  return { city, barangay: validBarangay ? barangay : '', fromUrl };
};

export default function App() {
  // Dev-only crash test: open /?crash=1 to trigger the ErrorBoundary maintenance page
  // if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('crash') === '1') {
  //   throw new Error('Manual crash test');
  // }

  const [locations] = useState<Location[]>(normalizeLocations(localLocations));
  const [initialSelection] = useState(() => getInitialSelection(locations));
  const [selectedCity, setSelectedCity] = useState(initialSelection.city);
  const [selectedBarangay, setSelectedBarangay] = useState(initialSelection.barangay);
  const userChangedLocation = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [offlineSavedAt, setOfflineSavedAt] = useState<number | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { profile, loading: authLoading, isAdmin } = useAuth();

  // Saved profile location wins over last-used location, but not over a shared link or manual pick
  useEffect(() => {
    if (authLoading || !profile?.default_city || !profile?.default_barangay) return;
    if (initialSelection.fromUrl || userChangedLocation.current) return;
    setSelectedCity(profile.default_city);
    setSelectedBarangay(profile.default_barangay);
  }, [authLoading, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedCity) url.searchParams.set('city', selectedCity);
    else url.searchParams.delete('city');
    if (selectedBarangay) url.searchParams.set('brgy', selectedBarangay);
    else url.searchParams.delete('brgy');
    window.history.replaceState(null, '', url);

    if (selectedCity && selectedBarangay) {
      localStorage.setItem('lastLocation', JSON.stringify({ city: selectedCity, barangay: selectedBarangay }));
    }
  }, [selectedCity, selectedBarangay]);

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  // Maintenance mode state
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Locations are bundled so dropdown works without backend runtime dependencies.

  const applyNotices = (list: Notice[]) => {
    setNotices(list);
    if (list.length === 0) return;
    const latest = list.reduce((a, b) => ((a.created_at ?? '') > (b.created_at ?? '') ? a : b));
    if (latest.created_at) {
      setLastUpdated(
        new Date(latest.created_at).toLocaleString('en-PH', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        })
      );
    }
  };

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
              setMaintenanceMode(true);
            }
          }
        } catch {
          // non-critical
        }
      }

      const supabaseNotices = await fetchNoticesFromSupabase();
      applyNotices(supabaseNotices);
      setOfflineSavedAt(null);
      try {
        localStorage.setItem(NOTICES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), notices: supabaseNotices }));
      } catch {
        // storage full or unavailable
      }
    } catch (err) {
      console.error('Error fetching notices from Supabase:', err);
      let cached: { savedAt?: unknown; notices?: unknown } | null = null;
      try {
        cached = JSON.parse(localStorage.getItem(NOTICES_CACHE_KEY) || 'null');
      } catch {
        cached = null;
      }
      if (cached && typeof cached.savedAt === 'number' && Array.isArray(cached.notices)) {
        applyNotices(cached.notices as Notice[]);
        setOfflineSavedAt(cached.savedAt);
      } else {
        setNotices([]);
        setLoadError('Unable to load latest schedules right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotices();
  }, []);

  useEffect(() => {
    if (offlineSavedAt === null) return;
    const retry = () => void loadNotices();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [offlineSavedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableBarangays = useMemo(() => {
    const city = locations.find(c => c.code === selectedCity);
    return city ? city.barangays : [];
  }, [locations, selectedCity]);

  // Overview shown before a barangay is picked: municipalities with brownouts in the next 7 days
  const weekSummary = useMemo(() => {
    const now = Date.now();
    const byCity = new Map<string, { name: string; code: string | null; barangays: Set<string>; firstStart: number }>();

    notices.forEach((n) => {
      n.data?.processed_images?.forEach((img: any) => {
        if (!Array.isArray(img.structured)) return;
        img.structured.forEach((s: any) => {
          const next = getScheduleTiming(Array.isArray(s.dates) ? s.dates : [], Array.isArray(s.times) ? s.times : [], now).next;
          if (!next || next.start > now + WEEK_MS) return;

          s.locations?.forEach((loc: any) => {
            const match = locations.find((l) => matchesMunicipality(loc.municipality, l.code, l.name));
            const rawName = String((typeof loc.municipality === 'object' ? loc.municipality?.name : loc.municipality) ?? '').trim();
            const name = match?.name ?? rawName;
            if (!name) return;
            const key = normalizeText(name);
            const entry = byCity.get(key) ?? { name, code: match?.code ?? null, barangays: new Set<string>(), firstStart: next.start };
            loc.barangays?.forEach((b: any) => {
              const bName = typeof b === 'object' ? b?.name : b;
              if (bName) entry.barangays.add(normalizeText(bName));
            });
            entry.firstStart = Math.min(entry.firstStart, next.start);
            byCity.set(key, entry);
          });
        });
      });
    });

    const cities = [...byCity.values()].sort((a, b) => a.firstStart - b.firstStart);
    return { cities, barangayCount: cities.reduce((sum, c) => sum + c.barangays.size, 0) };
  }, [notices, locations]);

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
               id: `${n.id}-${matches.length}`,
               dates: Array.isArray(s.dates) ? s.dates : [],
               times: Array.isArray(s.times) ? s.times : [],
               url: safeHttpUrl(n.url),
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

  // Get brownout schedules matching the user's saved default location (or current selection as fallback)
  const defaultLocationAlerts = useMemo(() => {
    const defCity = profile?.default_city || selectedCity;
    const defBarangay = profile?.default_barangay || selectedBarangay;
    if (!defCity || !defBarangay) return [];

    // If default location matches current selection, reuse matchedSchedules directly
    if (defCity === selectedCity && defBarangay === selectedBarangay && matchedSchedules) {
      return matchedSchedules;
    }

    const cityObj = locations.find((l) => l.code === defCity);
    const cityName = cityObj?.name || '';
    const barangayName = cityObj?.barangays.find((b) => b.code === defBarangay)?.name || '';

    const alerts: MatchedSchedule[] = [];
    notices.forEach((n) => {
      if (!n.data?.processed_images) return;
      n.data.processed_images.forEach((img: any) => {
        if (!Array.isArray(img.structured)) return;
        img.structured.forEach((s: any) => {
          let hasMatch = false;
          let matchedLocStr = '';
          let matchedAffectedArea: string | null = null;

          s.locations?.forEach((loc: any) => {
            if (matchesMunicipality(loc.municipality, defCity, cityName)) {
              loc.barangays?.forEach((b: any) => {
                if (matchesBarangay(b, defBarangay, barangayName)) {
                  hasMatch = true;
                  const cName = cityName || String((typeof loc.municipality === 'object' && loc.municipality?.name) || loc.municipality || '');
                  const bName = barangayName || String((typeof b === 'object' && b?.name) || b || '');
                  matchedLocStr = `${bName}, ${cName}`;
                  if (typeof b === 'object' && b?.affected_area) {
                    matchedAffectedArea = b.affected_area;
                  }
                }
              });
            }
          });

          if (hasMatch) {
            alerts.push({
              id: `${n.id}-def-${alerts.length}`,
              dates: Array.isArray(s.dates) ? s.dates : [],
              times: Array.isArray(s.times) ? s.times : [],
              url: safeHttpUrl(n.url),
              dateStr: Array.isArray(s.dates) && s.dates.length > 0 ? s.dates.join(', ') : new Date(n.created_at).toLocaleDateString(),
              timeStr: Array.isArray(s.times) && s.times.length > 0 ? s.times.join(', ') : 'See official notice',
              locationStr: matchedLocStr,
              affectedArea: matchedAffectedArea,
            });
          }
        });
      });
    });
    return alerts;
  }, [notices, profile, locations, selectedCity, selectedBarangay, matchedSchedules]);

  // Ended schedules are hidden; the rest are ordered by when they next start
  const upcomingDefaultAlerts = useMemo(() => {
    const now = Date.now();
    return defaultLocationAlerts
      .map((alert) => ({ alert, timing: getScheduleTiming(alert.dates, alert.times, now) }))
      .filter((v) => !v.timing.isPast)
      .sort((a, b) => (a.timing.next?.start ?? Infinity) - (b.timing.next?.start ?? Infinity))
      .map((v) => v.alert);
  }, [defaultLocationAlerts]);

  const scheduleViews = useMemo(() => {
    if (!matchedSchedules) return null;
    const now = Date.now();
    return matchedSchedules
      .map((schedule) => ({ schedule, timing: getScheduleTiming(schedule.dates, schedule.times, now) }))
      .filter((v) => !v.timing.isPast)
      .sort((a, b) => (a.timing.next?.start ?? Infinity) - (b.timing.next?.start ?? Infinity));
  }, [matchedSchedules]);

  const getHeadline = (timing: ScheduleTiming): string | null => {
    const { status, next, hasTimes } = timing;
    if (!next) return null;
    const range = hasTimes ? `${formatManilaTime(next.start)} – ${formatManilaTime(next.end)}` : 'time not specified';
    switch (status) {
      case 'ongoing':
        return hasTimes ? `Brownout ongoing until ${formatManilaTime(next.end)}` : 'Brownout scheduled today';
      case 'today':
        return `Brownout today, ${range}`;
      case 'tomorrow':
        return `Brownout tomorrow, ${range}`;
      default:
        return `Next brownout: ${formatManilaDate(next.start)}, ${range}`;
    }
  };

  const getStatusChip = (timing: ScheduleTiming): { label: string; className: string } | null => {
    switch (timing.status) {
      case 'ongoing':
        return timing.hasTimes
          ? { label: 'Ongoing now', className: 'bg-red-600 text-white' }
          : { label: 'Today', className: 'bg-orange-600 text-white' };
      case 'today':
        return { label: 'Today', className: 'bg-orange-600 text-white' };
      case 'tomorrow':
        return { label: 'Tomorrow', className: 'bg-amber-400 text-slate-900' };
      case 'upcoming':
        return {
          label: `In ${timing.daysAway} days`,
          className: isLightMode ? 'bg-slate-200 text-slate-800' : 'bg-white/15 text-white',
        };
      default:
        return null;
    }
  };

  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to legacy copy
    }
    // Clipboard API is unavailable on plain-HTTP pages (e.g. testing over LAN)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    textarea.remove();
    return ok;
  };

  const handleShare = async (schedule: MatchedSchedule) => {
    const text = [
      `Scheduled brownout: ${schedule.locationStr}`,
      `${schedule.dateStr}, ${schedule.timeStr}`,
      schedule.affectedArea ? `Affected area: ${schedule.affectedArea}` : '',
      `Official notice: ${schedule.url}`,
    ].filter(Boolean).join('\n');
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Brownout schedule', text, url: shareUrl });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    const copied = await copyText(`${text}\n${shareUrl}`);
    setCopiedId(copied ? schedule.id : `${schedule.id}:failed`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleAddToCalendar = (schedule: MatchedSchedule, timing: ScheduleTiming) => {
    const now = Date.now();
    const upcoming = timing.windows.filter((w) => w.end > now);
    if (upcoming.length === 0) return;
    const title = `Brownout: ${schedule.locationStr}`;
    const description = [
      schedule.affectedArea ? `Affected area: ${schedule.affectedArea}` : '',
      `Official notice: ${schedule.url}`,
    ].filter(Boolean).join('\n');

    // Android doesn't open .ics downloads in a calendar app; Google Calendar's template link does
    if (/Android/i.test(navigator.userAgent)) {
      const toGcal = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const next = upcoming[0];
      const gcal = new URL('https://calendar.google.com/calendar/render');
      gcal.searchParams.set('action', 'TEMPLATE');
      gcal.searchParams.set('text', title);
      gcal.searchParams.set('dates', `${toGcal(next.start)}/${toGcal(next.end)}`);
      gcal.searchParams.set('details', description);
      gcal.searchParams.set('location', schedule.locationStr);
      gcal.searchParams.set('ctz', 'Asia/Manila');
      window.open(gcal.toString(), '_blank', 'noopener,noreferrer');
      return;
    }

    const events = upcoming.map((w, i) => ({
      uid: `${schedule.id}-${i}-${w.start}@zn-brownout`,
      start: w.start,
      end: w.end,
      title,
      description,
      location: schedule.locationStr,
    }));

    const href = URL.createObjectURL(new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = 'brownout-schedule.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const handleCityChange = (cityCode: string) => {
    userChangedLocation.current = true;
    setSelectedCity(cityCode);
    setSelectedBarangay('');
  };

  const handleSearchSelect = (cityCode: string, barangayCode: string) => {
    userChangedLocation.current = true;
    setSelectedCity(cityCode);
    setSelectedBarangay(barangayCode);
  };

  const isLightMode = themeMode === 'light';
  const containerBgClass = isLightMode
    ? 'bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100'
    : 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900';
  const cardClass = isLightMode
    ? 'bg-white/70 border border-amber-200/70 shadow-2xl shadow-amber-200/40'
    : 'bg-white/10 border border-white/20 shadow-2xl';
  const sectionTextClass = isLightMode ? 'text-slate-800' : 'text-white';
  const mutedTextClass = isLightMode ? 'text-slate-600' : 'text-white/75';
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
          <h1 className={`text-2xl font-bold ${sectionTextClass}`}>Can't load schedules</h1>
          <p className={`mt-3 text-sm ${mutedTextClass}`}>
            {loadError} Please check your connection and try again.
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

  if (maintenanceMode && !isAdmin) {
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

      {/* Soft static glow */}
      <div className={`pointer-events-none absolute -top-48 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full blur-3xl z-0 ${isLightMode ? 'bg-amber-200/40' : 'bg-yellow-400/10'}`} />

      {/* Content */}
      <div className="relative z-10 w-full flex-grow flex flex-col items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-2xl"
        >
          {/* Glassmorphic Card */}
          <div className={`backdrop-blur-xl rounded-3xl overflow-hidden pointer-events-auto transition-colors duration-500 ${cardClass}`}>
            {/* Header with gradient */}
            <div className={`relative p-8 md:p-10 ${isLightMode ? 'bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-400' : 'bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400'}`}>
              <div className="absolute right-4 top-4 flex items-center gap-1.5">
                {isAdmin && (
                  <a
                    href="/admin"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${isLightMode ? 'bg-white/80 text-slate-700 hover:bg-white' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}
                    title="Admin Panel"
                  >
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </a>
                )}
                <button
                  onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${isLightMode ? 'bg-white/80 text-slate-700 hover:bg-white' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}
                  title={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
                  aria-label={isLightMode ? 'Switch to dark mode' : 'Switch to light mode'}
                  type="button"
                >
                  {isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isLightMode ? 'Dark Mode' : 'Light Mode'}</span>
                </button>
              </div>
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-8 sm:mt-6 flex items-center justify-center gap-3"
              >
                <div>
                  <Zap className="w-8 h-8 text-slate-900" fill="currentColor" aria-hidden="true" />
                </div>
                <h1 className="text-slate-900 text-center text-xl sm:text-2xl font-bold tracking-tight m-0 p-0 border-0">Zamboanga del Norte Brownout Schedule</h1>
              </motion.div>
            </div>

            {/* Form Section */}
            <div className="p-8 md:p-10 space-y-6">
              {offlineSavedAt !== null && (
                <div
                  role="status"
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${isLightMode ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-500/10 border-amber-400/40 text-amber-100'}`}
                >
                  <span>
                    You're offline. Showing schedules saved{' '}
                    {new Date(offlineSavedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}.
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadNotices()}
                    className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-yellow-300"
                  >
                    Retry
                  </button>
                </div>
              )}

              <LocationSearch locations={locations} isLightMode={isLightMode} onSelect={handleSearchSelect} />

              <div className={`flex items-center gap-3 text-xs uppercase tracking-wide ${mutedTextClass}`}>
                <span className={`h-px flex-1 ${isLightMode ? 'bg-slate-300' : 'bg-white/20'}`} />
                or choose from the list
                <span className={`h-px flex-1 ${isLightMode ? 'bg-slate-300' : 'bg-white/20'}`} />
              </div>

              {/* City Selector */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
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
                transition={{ duration: 0.2 }}
              >
                <label htmlFor="barangay" className={`flex items-center gap-2 mb-3 font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                  <MapPin className="w-4 h-4" />
                  Barangay
                </label>
                <div className="relative group">
                  <select
                    id="barangay"
                    value={selectedBarangay}
                    onChange={(e) => {
                      userChangedLocation.current = true;
                      setSelectedBarangay(e.target.value);
                    }}
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

              <div aria-live="polite">
              <AnimatePresence mode="wait">
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
                ) : !selectedBarangay ? (
                  <motion.div
                    key="week-summary"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`mt-8 ${panelClass} rounded-2xl p-5`}
                  >
                    {weekSummary.cities.length === 0 ? (
                      <p className={`text-sm ${sectionTextClass}`}>No scheduled brownouts posted for the next 7 days.</p>
                    ) : (
                      <>
                        <p className={`font-semibold ${sectionTextClass}`}>
                          Next 7 days: {weekSummary.barangayCount} {weekSummary.barangayCount === 1 ? 'barangay' : 'barangays'} in{' '}
                          {weekSummary.cities.length} {weekSummary.cities.length === 1 ? 'area' : 'areas'} have scheduled brownouts
                        </p>
                        <ul className="mt-3 space-y-1.5">
                          {weekSummary.cities.slice(0, 6).map((c) => (
                            <li key={c.name}>
                              <button
                                type="button"
                                disabled={!c.code}
                                onClick={() => c.code && handleCityChange(c.code)}
                                className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-white/10'}`}
                              >
                                <span className={`font-medium ${sectionTextClass}`}>{c.name}</span>
                                <span className={mutedTextClass}>
                                  {c.barangays.size} {c.barangays.size === 1 ? 'brgy' : 'brgys'} · from {formatManilaDate(c.firstStart)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {weekSummary.cities.length > 6 && (
                          <p className={`mt-2 px-3 text-xs ${mutedTextClass}`}>+{weekSummary.cities.length - 6} more areas</p>
                        )}
                        <p className={`mt-3 text-xs ${mutedTextClass}`}>Pick your barangay above to see exact times.</p>
                      </>
                    )}
                  </motion.div>
                ) : scheduleViews !== null && (
                  <motion.div
                    key={scheduleViews.length === 0 ? 'no-schedule' : 'has-schedule'}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="mt-8"
                  >
                    {scheduleViews.length === 0 ? (
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
                          <div>
                            <p className={`font-medium ${isLightMode ? 'text-emerald-800' : 'text-emerald-100'}`}>
                              No scheduled brownout found for your area
                              {lastUpdated ? ` as of ${lastUpdated}` : ''}.
                            </p>
                            <p className={`mt-1 text-xs ${isLightMode ? 'text-emerald-700' : 'text-emerald-100/80'}`}>
                              Based on official ZANECO notices. Unscheduled outages are not covered.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="space-y-4">
                        <div className={`flex items-start gap-3 ${isLightMode ? 'text-orange-800' : 'text-orange-200'}`}>
                          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" aria-hidden="true" />
                          <div>
                            <p className="text-lg font-bold leading-snug">
                              {getHeadline(scheduleViews[0].timing) ?? 'Scheduled brownout found'}
                            </p>
                            <p className={`text-sm ${mutedTextClass}`}>
                              {scheduleViews.length} scheduled {scheduleViews.length === 1 ? 'interruption' : 'interruptions'} for this barangay
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {scheduleViews.map(({ schedule, timing }, index) => {
                            const chip = getStatusChip(timing);
                            const actionClass = `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${isLightMode ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-white/10 text-white hover:bg-white/20'}`;
                            return (
                            <motion.div
                              key={schedule.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className={`${panelClass} rounded-2xl p-5 transition-all duration-300 group ${isLightMode ? 'hover:bg-white' : 'hover:bg-white/15'}`}
                            >
                              <div className="space-y-3">
                                {chip && (
                                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${chip.className}`}>
                                    {chip.label}
                                  </span>
                                )}
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
                                      {timing.durationMinutes !== null && timing.durationMinutes > 0 && (
                                        <div className={`text-xs mt-0.5 ${mutedTextClass}`}>
                                          about {formatDuration(timing.durationMinutes)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <a
                                    href={schedule.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={actionClass}
                                  >
                                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                                    Official notice
                                  </a>
                                  <button type="button" onClick={() => void handleShare(schedule)} className={actionClass}>
                                    {copiedId === schedule.id ? <Check className="w-4 h-4" aria-hidden="true" /> : <Share2 className="w-4 h-4" aria-hidden="true" />}
                                    {copiedId === schedule.id ? 'Copied' : copiedId === `${schedule.id}:failed` ? "Couldn't copy" : 'Share'}
                                  </button>
                                  {timing.windows.length > 0 && (
                                    <button type="button" onClick={() => handleAddToCalendar(schedule, timing)} className={actionClass}>
                                      <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                                      Add to calendar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              </div>

              <NotificationBanner
                isLightMode={isLightMode}
                onLoginClick={() => setShowAuthModal(true)}
                locations={locations}
                selectedCity={selectedCity}
                selectedBarangay={selectedBarangay}
                defaultAlerts={upcomingDefaultAlerts}
              />
            </div>
          </div>
        </motion.div>

        {/* Report & Feedback */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
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
          transition={{ duration: 0.2 }}
          className={`mt-2 flex flex-col items-center gap-1.5 text-center text-sm ${isLightMode ? 'text-slate-600' : 'text-white/70'}`}
        >
          <p>
            Data sourced from official ZANECO announcements.
          </p>
          {lastUpdated && (
            <p className="text-xs">Data last updated: {lastUpdated}</p>
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
