import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, LogOut, Navigation, Loader2, AlertTriangle, Settings2 } from 'lucide-react';
import { useAuth } from './AuthContext';

interface NotificationBannerProps {
  isLightMode: boolean;
  onLoginClick: () => void;
  locations: { code: string; name: string; barangays: { code: string; name: string }[] }[];
  selectedCity: string;
  selectedBarangay: string;
  onAutoLocation: (cityCode: string, barangayCode: string) => void;
}

// Simple reverse geocode using Nominatim (free, no API key)
async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; barangay: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`,
      { headers: { 'User-Agent': 'ZN-Brownout-Checker/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    // Nominatim returns various fields; try multiple common ones
    const city =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.city_district ||
      addr.county ||
      '';
    const barangay =
      addr.suburb ||
      addr.village ||
      addr.neighbourhood ||
      addr.hamlet ||
      '';
    return { city, barangay };
  } catch {
    return null;
  }
}

export default function NotificationBanner({
  isLightMode,
  onLoginClick,
  locations,
  selectedCity,
  selectedBarangay,
  onAutoLocation,
}: NotificationBannerProps) {
  const { user, profile, signOut, saveProfile } = useAuth();

  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error' | 'not-found'>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);

  // Attempt to get browser location and match to a known city/barangay
  const handleAutoDetect = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoStatus('loading');
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const result = await reverseGeocode(latitude, longitude);

        if (!result) {
          setGeoStatus('error');
          setGeoError('Could not determine your location. Please select manually.');
          return;
        }

        // Try to match city
        const normalize = (s: string) =>
          s
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const cityNorm = normalize(result.city);
        const brgyNorm = normalize(result.barangay);

        const matchedCity = locations.find((l) => normalize(l.name) === cityNorm);
        if (!matchedCity) {
          setGeoStatus('not-found');
          setGeoError(`"${result.city}" is not in our list. Please select manually.`);
          return;
        }

        const matchedBarangay = matchedCity.barangays.find((b) => normalize(b.name) === brgyNorm);
        if (!matchedBarangay) {
          // Set city anyway, let user pick barangay
          onAutoLocation(matchedCity.code, '');
          setGeoStatus('not-found');
          setGeoError(`Barangay "${result.barangay}" not found. Please select it manually.`);
          return;
        }

        // Success
        onAutoLocation(matchedCity.code, matchedBarangay.code);
        setGeoStatus('idle');
      },
      (err) => {
        setGeoStatus('error');
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission denied. Please select manually.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError('Location unavailable. Please select manually.');
        } else {
          setGeoError('Could not get location. Please select manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [locations, onAutoLocation]);

  // Derive display names
  const savedCityName = locations.find((l) => l.code === profile?.default_city)?.name ?? '';
  const savedBarangayName =
    locations
      .find((l) => l.code === profile?.default_city)
      ?.barangays.find((b) => b.code === profile?.default_barangay)?.name ?? '';

  const currentCityName = locations.find((l) => l.code === selectedCity)?.name ?? '';
  const currentBarangayName =
    locations
      .find((l) => l.code === selectedCity)
      ?.barangays.find((b) => b.code === selectedBarangay)?.name ?? '';

  // --- Guest banner ---
  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
        className={`relative overflow-hidden rounded-2xl border ${
          isLightMode ? 'bg-amber-50/80 border-amber-200/80' : 'bg-white/5 border-white/10'
        }`}
      >
        {/* Subtle shimmer */}
        <div
          className={`absolute inset-0 pointer-events-none ${
            isLightMode
              ? 'bg-gradient-to-r from-amber-100/60 via-transparent to-orange-100/40'
              : 'bg-gradient-to-r from-yellow-400/5 via-transparent to-orange-400/5'
          }`}
        />

        <div className="relative p-4 space-y-3">
          {/* Location detection row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={handleAutoDetect}
              disabled={geoStatus === 'loading'}
              className={`group flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-wait ${
                isLightMode
                  ? 'bg-white border border-amber-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300 focus-visible:ring-amber-400 focus-visible:ring-offset-amber-50'
                  : 'bg-white/10 border border-white/15 text-white/90 hover:bg-white/15 hover:border-white/25 focus-visible:ring-yellow-400 focus-visible:ring-offset-slate-900'
              }`}
            >
              {geoStatus === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              )}
              {geoStatus === 'loading' ? 'Detecting...' : 'Use my location'}
            </button>

            <span
              className={`hidden sm:block text-xs ${
                isLightMode ? 'text-slate-400' : 'text-white/40'
              }`}
            >
              or
            </span>

            <p
              className={`sm:hidden text-center text-xs ${
                isLightMode ? 'text-slate-400' : 'text-white/40'
              }`}
            >
              or select your location below
            </p>

            <p
              className={`hidden sm:block flex-1 text-xs ${
                isLightMode ? 'text-slate-500' : 'text-white/60'
              }`}
            >
              select your location below
            </p>
          </div>

          {/* Error / not-found message */}
          <AnimatePresence>
            {(geoStatus === 'error' || geoStatus === 'not-found') && geoError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                  isLightMode
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-orange-400/15 text-orange-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{geoError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sign in prompt */}
          <div
            className={`flex items-center justify-between pt-2 border-t ${
              isLightMode ? 'border-amber-200/60' : 'border-white/10'
            }`}
          >
            <p
              className={`text-xs ${
                isLightMode ? 'text-slate-500' : 'text-white/50'
              }`}
            >
              Want alerts before brownouts?
            </p>
            <button
              type="button"
              onClick={onLoginClick}
              className={`text-xs font-semibold transition-colors ${
                isLightMode
                  ? 'text-slate-900 hover:text-slate-600'
                  : 'text-yellow-400 hover:text-yellow-300'
              }`}
            >
              Sign in
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // --- Logged-in user panel ---
  const displayName =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'there';

  const hasSavedLocation = profile?.default_city && profile?.default_barangay;
  const currentMatchesSaved =
    selectedCity === profile?.default_city && selectedBarangay === profile?.default_barangay;
  const canSave = selectedCity && selectedBarangay && !currentMatchesSaved;

  const handleSaveAsDefault = async () => {
    if (!selectedCity || !selectedBarangay) return;
    await saveProfile({
      default_city: selectedCity,
      default_barangay: selectedBarangay,
      notifications_enabled: true, // keep enabled when saving
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`rounded-2xl border p-4 space-y-3 ${
        isLightMode ? 'bg-emerald-50/80 border-emerald-200/70' : 'bg-white/5 border-white/10'
      }`}
    >
      {/* Greeting + sign out */}
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-sm font-medium truncate ${
            isLightMode ? 'text-slate-800' : 'text-white/90'
          }`}
        >
          Hi, {displayName}!
        </p>

        <button
          type="button"
          onClick={signOut}
          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            isLightMode
              ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              : 'text-white/30 hover:text-white/60 hover:bg-white/8'
          }`}
        >
          <LogOut className="w-3 h-3" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Default location info */}
      {hasSavedLocation && (
        <div
          className={`flex items-center gap-2 text-xs ${
            isLightMode ? 'text-emerald-700' : 'text-emerald-300/80'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            Default location: {savedBarangayName}, {savedCityName}
          </span>
        </div>
      )}

      {/* Change default location */}
      {canSave && (
        <button
          type="button"
          onClick={handleSaveAsDefault}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
            isLightMode
              ? 'bg-slate-900 text-white hover:bg-slate-700'
              : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Set {currentBarangayName ? `"${currentBarangayName}"` : 'this'} as default location
        </button>
      )}

      {/* If nothing selected yet, prompt user */}
      {!hasSavedLocation && !canSave && (
        <p
          className={`text-xs ${
            isLightMode ? 'text-slate-500' : 'text-white/50'
          }`}
        >
          Select a location below to set as your default.
        </p>
      )}
    </motion.div>
  );
}
