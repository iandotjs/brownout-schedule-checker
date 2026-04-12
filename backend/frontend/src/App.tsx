import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Building2, Zap, Calendar, Clock, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import localLocations from './locations.json';

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
}

type MunicipalityValue = { code?: string | null; name?: string | null } | string | null | undefined;
type BarangayValue = { code?: string | null; name?: string | null } | string | null | undefined;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
    throw new Error(`Supabase fallback failed: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export default function App() {
  const [locations, setLocations] = useState<Location[]>(normalizeLocations(localLocations));
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch cached PSGC locations from backend
  useEffect(() => {
    fetch(apiUrl('/api/locations'))
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch locations: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const normalized = normalizeLocations(data);
        if (normalized.length > 0) {
          setLocations(normalized);
        }
      })
      .catch((err) => {
        // Keep local bundled locations when backend API is unavailable.
        console.error('Error fetching locations, using bundled fallback:', err);
      });
  }, []);

  // Fetch notices
  useEffect(() => {
    setLoading(true);
    const loadNotices = async () => {
      try {
        const apiRes = await fetch(apiUrl('/api/notices/latest'));
        if (!apiRes.ok) {
          throw new Error(`Failed to fetch notices: ${apiRes.status}`);
        }

        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          setNotices(apiData);
          return;
        }

        setNotices([]);
      } catch (apiErr) {
        console.error('Error fetching notices from API, trying Supabase fallback:', apiErr);
        try {
          const fallbackNotices = await fetchNoticesFromSupabase();
          setNotices(fallbackNotices);
        } catch (fallbackErr) {
          console.error('Error fetching notices from Supabase fallback:', fallbackErr);
          setNotices([]);
        }
      } finally {
        setLoading(false);
      }
    };

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
               locationStr: matchedLocStr
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

  return (
    <div className="size-full relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 min-h-screen flex flex-col">
      {/* City skyline silhouette */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black/80 to-transparent z-0">
        <svg className="absolute bottom-0 w-full h-48 text-black/60" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,192L48,176C96,160,192,128,288,128C384,128,480,160,576,165.3C672,171,768,149,864,154.7C960,160,1056,192,1152,186.7C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>

      {/* Electric grid lines */}
      <div className="absolute inset-0 opacity-10 z-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(251, 191, 36, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(251, 191, 36, 0.3) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Animated electric orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          className="absolute -top-40 -left-40 w-96 h-96 bg-yellow-400/30 rounded-full blur-3xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-20 right-20 w-72 h-72 bg-cyan-400/20 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-40 left-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"
          animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Electric sparks/particles */}
      <div className="pointer-events-none z-0">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute bg-yellow-400 rounded-full"
            style={{
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
            transition={{ duration: Math.random() * 2 + 1, repeat: Infinity, delay: Math.random() * 3 }}
          />
        ))}
      </div>

      {/* Lightning strikes */}
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

      {/* Content */}
      <div className="relative z-10 w-full flex-grow flex flex-col items-center justify-center p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-2xl"
        >
          {/* Glassmorphic Card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl overflow-hidden pointer-events-auto">
            {/* Header with gradient */}
            <div className="relative bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500 p-8 md:p-10">
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
                <h1 className="text-white text-center text-2xl font-bold tracking-tight m-0 p-0 border-0">Brownout Schedule Checker</h1>
              </motion.div>
            </div>

            {/* Form Section */}
            <div className="p-8 md:p-10 space-y-6">
              {/* City Selector */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <label htmlFor="city" className="flex items-center gap-2 mb-3 text-white/90 font-medium">
                  <Building2 className="w-4 h-4" />
                  City / Municipality
                </label>
                <div className="relative group">
                  <select
                    id="city"
                    value={selectedCity}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="w-full px-5 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl text-white appearance-none cursor-pointer focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all duration-300 hover:bg-white/15"
                  >
                    <option value="" className="bg-gray-900">Select a city</option>
                    {locations.map((loc) => (
                      <option key={loc.code} value={loc.code} className="bg-gray-900 border-none">
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/60">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <label htmlFor="barangay" className="flex items-center gap-2 mb-3 text-white/90 font-medium">
                  <MapPin className="w-4 h-4" />
                  Barangay
                </label>
                <div className="relative group">
                  <select
                    id="barangay"
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    disabled={!selectedCity}
                    className="w-full px-5 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl text-white appearance-none cursor-pointer focus:outline-none focus:border-yellow-400 focus:bg-white/20 transition-all duration-300 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                  >
                    <option value="" className="bg-gray-900">Select a barangay</option>
                    {availableBarangays.map((barangay) => (
                      <option key={barangay.code} value={barangay.code} className="bg-gray-900 border-none">
                        {barangay.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/60">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </motion.div>

              {/* Status or Results Section */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="mt-8 text-center"
                  >
                     <p className="text-white/60">Scanning schedules from ZANECO...</p>
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
                        className="relative overflow-hidden bg-gradient-to-r from-emerald-500/20 to-teal-500/20 backdrop-blur-sm border border-emerald-400/30 rounded-2xl p-6"
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
                          <p className="text-emerald-100 font-medium">
                            Great news! No scheduled brownout in your area.
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-orange-300">
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
                              className="relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 hover:bg-white/15 transition-all duration-300 group"
                            >
                              <a 
                                href={schedule.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                                title="View the official notice details"
                              >
                                <Info className="w-5 h-5" />
                              </a>
                              <div className="space-y-3 pr-8">
                                <div className="flex items-start gap-3">
                                  <MapPin className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <div className="text-xs text-white/60 mb-1">Location</div>
                                    <div className="text-white text-sm font-medium">
                                      {schedule.locationStr}
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="flex items-start gap-3">
                                    <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <div className="text-xs text-white/60 mb-1">Date</div>
                                      <div className="text-white text-sm font-medium">
                                        {schedule.dateStr}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-3">
                                    <Clock className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <div className="text-xs text-white/60 mb-1">Time</div>
                                      <div className="text-white text-sm font-medium">
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
      </div>
    </div>
  );
}
