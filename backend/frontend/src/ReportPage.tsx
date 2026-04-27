import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { MapPin, Building2, Home, Phone, MessageSquare, Send, CheckCircle2, AlertTriangle, Mail, Clock, MapPinned } from 'lucide-react';
import localLocations from './locations.json';

type ThemeMode = 'light' | 'dark';
type TabId = 'location' | 'issue' | 'suggestion';

interface Location {
  code: string;
  name: string;
  barangays: { code: string; name: string }[];
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const normalizeLocations = (data: unknown): Location[] => {
  if (Array.isArray(data)) return data as Location[];
  return [];
};

export default function ReportPage() {
  const [locations] = useState<Location[]>(normalizeLocations(localLocations));
  const [themeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [activeTab, setActiveTab] = useState<TabId>('location');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Location report state
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [locationType, setLocationType] = useState<'purok' | 'landmark' | 'street' | 'establishment'>('purok');
  const [locationName, setLocationName] = useState('');

  // Suggestion state
  const [suggestionText, setSuggestionText] = useState('');

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
    ? 'w-full px-4 py-3 text-sm md:text-base bg-white/80 border border-amber-200 rounded-xl text-slate-800 appearance-none cursor-pointer focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30 focus:bg-white transition-all duration-300 hover:bg-white hover:shadow-md'
    : 'w-full px-4 py-3 text-sm md:text-base bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white appearance-none cursor-pointer focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 focus:bg-white/20 transition-all duration-300 hover:bg-white/15 hover:shadow-md hover:shadow-black/10';
  const chevronClass = isLightMode
    ? 'absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 transition-colors duration-300 group-hover:text-amber-500'
    : 'absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 transition-colors duration-300 group-hover:text-yellow-400';
  const chevronIcon = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  const availableBarangays = useMemo(() => {
    const city = locations.find((c) => c.code === selectedCity);
    return city ? city.barangays : [];
  }, [locations, selectedCity]);

  const selectedCityName = useMemo(() => {
    return locations.find((c) => c.code === selectedCity)?.name || '';
  }, [locations, selectedCity]);

  const selectedBarangayName = useMemo(() => {
    return availableBarangays.find((b) => b.code === selectedBarangay)?.name || '';
  }, [availableBarangays, selectedBarangay]);

  const handleCityChange = (code: string) => {
    setSelectedCity(code);
    setSelectedBarangay('');
  };

  const handleSubmitLocation = async () => {
    if (!selectedCity || !selectedBarangay || !locationName.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        type: 'location_report',
        municipality: selectedCityName,
        barangay: selectedBarangayName,
        location_type: locationType,
        location_name: locationName.trim(),
        created_at: new Date().toISOString(),
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 201) {
        setSubmitted(true);
        setLocationName('');
        setTimeout(() => setSubmitted(false), 3000);
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    if (!suggestionText.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        type: 'suggestion',
        message: suggestionText.trim(),
        created_at: new Date().toISOString(),
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/community_reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 201) {
        setSubmitted(true);
        setSuggestionText('');
        setTimeout(() => setSubmitted(false), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'location', label: 'Report Location', icon: <MapPin className="w-4 h-4" /> },
    { id: 'issue', label: 'Report Issue', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'suggestion', label: 'Suggestion', icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 md:p-8 transition-colors duration-500 ${containerBgClass}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl"
      >
        <div className={`backdrop-blur-xl rounded-3xl overflow-hidden ${cardClass}`}>
          {/* Header */}
          <div className={`p-6 md:p-8 ${isLightMode ? 'bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'}`}>
            <h1 className="text-white text-center text-xl font-bold tracking-tight">Help Improve Results</h1>
            <p className="text-white/80 text-center text-sm mt-1">Your local knowledge makes this tool better for everyone</p>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${isLightMode ? 'border-amber-200/70' : 'border-white/10'}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSubmitted(false); }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? isLightMode
                      ? 'text-cyan-700 border-b-2 border-cyan-500 bg-cyan-50/50'
                      : 'text-yellow-400 border-b-2 border-yellow-400 bg-white/5'
                    : isLightMode
                      ? 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ').pop()}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6 md:p-8 space-y-5">
            {/* Success banner */}
            {submitted && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-center gap-3 p-4 rounded-xl ${isLightMode ? 'bg-emerald-100 border border-emerald-300' : 'bg-emerald-500/20 border border-emerald-400/30'}`}
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className={`text-sm font-medium ${isLightMode ? 'text-emerald-800' : 'text-emerald-200'}`}>
                  Thank you! Your report has been submitted.
                </p>
              </motion.div>
            )}

            {/* Tab: Report Location */}
            {activeTab === 'location' && (
              <div className="space-y-4">
                <p className={`text-sm ${mutedTextClass}`}>
                  Help us map puroks, landmarks, streets, and establishments to the correct barangay.
                  This improves brownout schedule matching for your area.
                </p>

                {/* City */}
                <div>
                  <label className={`flex items-center gap-2 mb-2 text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                    <Building2 className="w-4 h-4" /> City / Municipality
                  </label>
                  <div className="relative group">
                    <select value={selectedCity} onChange={(e) => handleCityChange(e.target.value)} className={fieldClass}>
                      <option value="">Select a city</option>
                      {locations.map((loc) => (
                        <option key={loc.code} value={loc.code} className={isLightMode ? 'bg-white text-slate-800' : 'bg-gray-900'}>{loc.name}</option>
                      ))}
                    </select>
                    <div className={chevronClass}>{chevronIcon}</div>
                  </div>
                </div>

                {/* Barangay */}
                <div>
                  <label className={`flex items-center gap-2 mb-2 text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                    <MapPin className="w-4 h-4" /> Barangay
                  </label>
                  <div className="relative group">
                    <select
                      value={selectedBarangay}
                      onChange={(e) => setSelectedBarangay(e.target.value)}
                      disabled={!selectedCity}
                      className={`${fieldClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <option value="">Select a barangay</option>
                      {availableBarangays.map((b) => (
                        <option key={b.code} value={b.code} className={isLightMode ? 'bg-white text-slate-800' : 'bg-gray-900'}>{b.name}</option>
                      ))}
                    </select>
                    <div className={chevronClass}>{chevronIcon}</div>
                  </div>
                </div>

                {/* Location Type */}
                <div>
                  <label className={`block mb-2 text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                    What are you reporting?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['purok', 'landmark', 'street', 'establishment'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setLocationType(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                          locationType === t
                            ? isLightMode
                              ? 'bg-cyan-500 text-white'
                              : 'bg-yellow-400 text-black'
                            : isLightMode
                              ? 'bg-white/80 text-slate-600 border border-amber-200 hover:bg-white'
                              : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/15'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location Name */}
                <div>
                  <label className={`block mb-2 text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                    Name of {locationType}
                  </label>
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder={
                      locationType === 'purok' ? 'e.g., Prk. Greenleaves' :
                      locationType === 'landmark' ? 'e.g., Covered Court, ZANECO Motorpool' :
                      locationType === 'street' ? 'e.g., Rizal Avenue' :
                      'e.g., Rose Pharmacy, Jollibee'
                    }
                    className={fieldClass}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitLocation}
                  disabled={submitting || !selectedCity || !selectedBarangay || !locationName.trim()}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLightMode
                      ? 'bg-cyan-500 hover:bg-cyan-600 text-white'
                      : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            )}

            {/* Tab: Report Issue */}
            {activeTab === 'issue' && (
              <div className="space-y-5">
                <p className={`text-sm ${mutedTextClass}`}>
                  Experiencing an unscheduled brownout or power issue? Contact ZANECO directly for fastest response.
                </p>

                <div className={`rounded-xl p-5 space-y-4 ${isLightMode ? 'bg-amber-50 border border-amber-200' : 'bg-white/5 border border-white/10'}`}>
                  <h3 className={`font-semibold ${sectionTextClass}`}>ZANECO Contact Information</h3>

                  <div className="space-y-3">
                    <a
                      href="tel:09206290163"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <Phone className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>0920-629-0163</div>
                        <div className={`text-xs ${mutedTextClass}`}>via zaneco.ph</div>
                      </div>
                    </a>

                    <a
                      href="tel:09558848240"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <Phone className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>0955-884-8240</div>
                        <div className={`text-xs ${mutedTextClass}`}>via zaneco.ph</div>
                      </div>
                    </a>

                    <a
                      href="tel:09998838636"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <Phone className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>0999-883-8636</div>
                        <div className={`text-xs ${mutedTextClass}`}>via ZANECO Facebook</div>
                      </div>
                    </a>

                    <a
                      href="mailto:zanecolamdag@gmail.com"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <Mail className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>Email</div>
                        <div className={`text-xs ${mutedTextClass}`}>zanecolamdag@gmail.com</div>
                      </div>
                    </a>

                    <a
                      href="https://www.facebook.com/profile.php?id=61551218819204"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <svg className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>Facebook Page</div>
                        <div className={`text-xs ${mutedTextClass}`}>ZANECO Official</div>
                      </div>
                    </a>

                    <a
                      href="https://zaneco.ph"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isLightMode ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`}
                    >
                      <Home className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-cyan-600' : 'text-yellow-400'}`} />
                      <div>
                        <div className={`text-sm font-medium ${sectionTextClass}`}>Website</div>
                        <div className={`text-xs ${mutedTextClass}`}>zaneco.ph</div>
                      </div>
                    </a>
                  </div>

                  <div className={`mt-4 pt-4 space-y-2 ${isLightMode ? 'border-t border-amber-200' : 'border-t border-white/10'}`}>
                    <div className="flex items-start gap-3">
                      <MapPinned className={`w-4 h-4 flex-shrink-0 mt-0.5 ${mutedTextClass}`} />
                      <p className={`text-xs ${mutedTextClass}`}>Gen. Luna St., Dipolog City, Philippines</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className={`w-4 h-4 flex-shrink-0 mt-0.5 ${mutedTextClass}`} />
                      <p className={`text-xs ${mutedTextClass}`}>Mon–Fri: 8:00 AM – 5:00 PM · Sat &amp; Holidays: 8:00 AM – 5:00 PM</p>
                    </div>
                  </div>
                </div>

                <p className={`text-xs text-center ${mutedTextClass}`}>
                  For safety, always report power lines down or electrical emergencies directly to ZANECO.
                </p>
                <p className={`text-xs text-center italic ${mutedTextClass}`}>
                  Contact details sourced from the official{' '}
                  <a href="https://zaneco.ph" target="_blank" rel="noopener noreferrer" className="underline">zaneco.ph</a>
                  {' '}website and{' '}
                  <a href="https://www.facebook.com/profile.php?id=61551218819204" target="_blank" rel="noopener noreferrer" className="underline">ZANECO Facebook page</a>.
                </p>
              </div>
            )}

            {/* Tab: Suggestion */}
            {activeTab === 'suggestion' && (
              <div className="space-y-4">
                <p className={`text-sm ${mutedTextClass}`}>
                  Have an idea to improve this tool? Found an error in the schedule data? Let us know!
                </p>

                <div>
                  <label className={`block mb-2 text-sm font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
                    Your suggestion or feedback
                  </label>
                  <textarea
                    value={suggestionText}
                    onChange={(e) => setSuggestionText(e.target.value)}
                    placeholder="e.g., The schedule for Brgy. Galas was incorrect on April 10..."
                    rows={4}
                    className={`${fieldClass} resize-none`}
                  />
                </div>

                <button
                  onClick={handleSubmitSuggestion}
                  disabled={submitting || !suggestionText.trim()}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLightMode
                      ? 'bg-cyan-500 hover:bg-cyan-600 text-white'
                      : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Send Suggestion'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Back to Home */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 text-center"
        >
          <a
            href="/"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              isLightMode
                ? 'bg-white/80 text-slate-700 border border-amber-200 hover:bg-white'
                : 'bg-white/10 text-white/80 border border-white/20 hover:bg-white/15'
            }`}
          >
            <Home className="w-4 h-4" />
            Back to Checker
          </a>
        </motion.div>
      </motion.div>
    </div>
  );
}
