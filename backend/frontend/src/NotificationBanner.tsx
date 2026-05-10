import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, LogOut, MapPin, Save, X as XIcon, Zap, Calendar, Clock, ExternalLink } from 'lucide-react';
import { useAuth } from './AuthContext';

interface MatchedSchedule {
  id: string;
  url: string;
  locationStr: string;
  dateStr: string;
  timeStr: string;
  affectedArea: string | null;
}

interface NotificationBannerProps {
  isLightMode: boolean;
  onLoginClick: () => void;
  locations: { code: string; name: string; barangays: { code: string; name: string }[] }[];
  selectedCity: string;
  selectedBarangay: string;
  defaultAlerts: MatchedSchedule[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 13) return 'Good noon';
  if (hour >= 13 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function getUserDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata;
  if (meta) {
    const name = meta.full_name || meta.name;
    if (typeof name === 'string' && name.trim()) {
      return name.trim().split(' ')[0];
    }
  }
  if (user.email) {
    return user.email.split('@')[0];
  }
  return 'there';
}

export default function NotificationBanner({
  isLightMode,
  onLoginClick,
  locations,
  selectedCity,
  selectedBarangay,
  defaultAlerts,
}: NotificationBannerProps) {
  const { user, profile, signOut, saveProfile } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when notification modal is open
  useEffect(() => {
    if (showNotifications) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showNotifications]);

  // Close notification modal on outside click
  useEffect(() => {
    if (!showNotifications) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    // Delay to avoid the bell click itself closing it
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [showNotifications]);

  const getLocationLabel = (cityCode: string, barangayCode: string) => {
    const city = locations.find((l) => l.code === cityCode);
    const barangay = city?.barangays.find((b) => b.code === barangayCode);
    const cityName = city?.name ?? '';
    const barangayName = barangay?.name ?? '';
    if (barangayName && cityName) return `${barangayName}, ${cityName}`;
    return cityName || 'Unknown location';
  };

  const handleSaveLocation = async () => {
    if (!selectedCity || !selectedBarangay) return;
    setSaving(true);
    await saveProfile({
      default_city: selectedCity,
      default_barangay: selectedBarangay,
    });
    setSaving(false);
  };

  const hasSavedLocation = profile?.default_city && profile?.default_barangay;
  const currentMatchesSaved =
    selectedCity === profile?.default_city && selectedBarangay === profile?.default_barangay;
  const canSave = selectedCity && selectedBarangay && !currentMatchesSaved;

  // --- Guest banner ---
  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
        className={`relative overflow-hidden rounded-2xl border ${
          isLightMode
            ? 'bg-amber-50/80 border-amber-200/80'
            : 'bg-white/5 border-white/10'
        }`}
      >
        <div
          className={`absolute inset-0 pointer-events-none ${
            isLightMode
              ? 'bg-gradient-to-r from-amber-100/60 via-transparent to-orange-100/40'
              : 'bg-gradient-to-r from-yellow-400/5 via-transparent to-orange-400/5'
          }`}
        />
        <div className="relative flex flex-col sm:flex-row items-center gap-3 p-4">
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
              isLightMode ? 'bg-amber-100 text-amber-600' : 'bg-yellow-400/15 text-yellow-400'
            }`}
          >
            <Zap className="w-4 h-4" fill="currentColor" />
          </div>
          <p className={`text-sm flex-1 text-center sm:text-left leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-white/70'}`}>
            Get notified before brownouts hit your area.
          </p>
          <button
            onClick={onLoginClick}
            className={`group relative whitespace-nowrap inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              isLightMode
                ? 'bg-slate-900 text-white hover:bg-slate-700 focus-visible:ring-slate-900 focus-visible:ring-offset-amber-50'
                : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300 focus-visible:ring-yellow-400 focus-visible:ring-offset-slate-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
            Sign in to get alerts
          </button>
        </div>
      </motion.div>
    );
  }

  // --- Logged-in user panel ---
  const displayName = getUserDisplayName(user);
  const greeting = getGreeting();
  const avatarUrl = (user.user_metadata as Record<string, unknown>)?.avatar_url as string | undefined;
  const savedLocationLabel = hasSavedLocation
    ? getLocationLabel(profile.default_city!, profile.default_barangay!)
    : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="space-y-1"
      >
        {/* Greeting row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                  isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-400/15 text-yellow-400'
                }`}
              >
                {displayName[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className={`text-sm font-semibold truncate ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                {greeting}, {displayName}!
              </p>
              {/* Saved location displayed under greeting */}
              {savedLocationLabel ? (
                <p className={`text-[11px] truncate flex items-center gap-1 ${isLightMode ? 'text-slate-400' : 'text-white/35'}`}>
                  <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                  {savedLocationLabel}
                </p>
              ) : canSave ? (
                <button
                  onClick={handleSaveLocation}
                  disabled={saving}
                  className={`text-[11px] flex items-center gap-1 transition-colors ${
                    isLightMode
                      ? 'text-emerald-500 hover:text-emerald-600'
                      : 'text-yellow-400/60 hover:text-yellow-400/80'
                  } disabled:opacity-50`}
                >
                  <Save className="w-2.5 h-2.5" />
                  {saving ? 'Saving...' : 'Save current location'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Bell icon */}
            <button
              onClick={() => setShowNotifications(true)}
              className={`relative p-2 rounded-lg transition-colors ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/8'
              }`}
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {defaultAlerts.length > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                  isLightMode ? 'bg-red-500' : 'bg-yellow-400'
                }`} />
              )}
            </button>

            {/* Sign out */}
            <button
              onClick={signOut}
              className={`p-2 rounded-lg transition-colors ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/8'
              }`}
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Save location hint when saved location differs from current selection */}
        {hasSavedLocation && canSave && (
          <div className="flex items-center justify-between pl-[42px]">
            <button
              onClick={handleSaveLocation}
              disabled={saving}
              className={`text-[11px] flex items-center gap-1 transition-colors ${
                isLightMode
                  ? 'text-emerald-500 hover:text-emerald-600'
                  : 'text-yellow-400/60 hover:text-yellow-400/80'
              } disabled:opacity-50`}
            >
              <Save className="w-2.5 h-2.5" />
              {saving ? 'Saving...' : 'Update saved location'}
            </button>
          </div>
        )}
      </motion.div>

      {/* Notification modal - centered overlay with backdrop (portalled to body) */}
      {createPortal(
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${
                isLightMode
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-800 border-white/10'
              }`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isLightMode ? 'border-slate-100' : 'border-white/8'}`}>
                <div>
                  <p className={`text-sm font-semibold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    Notifications
                  </p>
                  <p className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-400' : 'text-white/35'}`}>
                    Alerts for your saved location
                  </p>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLightMode
                      ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      : 'text-white/30 hover:text-white/60 hover:bg-white/8'
                  }`}
                  aria-label="Close"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-4">
                {(hasSavedLocation || defaultAlerts.length > 0) ? (
                  <div className="space-y-3">
                    {savedLocationLabel && (
                      <div className={`flex items-center gap-2.5 p-3 rounded-xl ${
                        isLightMode ? 'bg-emerald-50' : 'bg-yellow-400/8'
                      }`}>
                        <MapPin className={`w-4 h-4 flex-shrink-0 ${isLightMode ? 'text-emerald-500' : 'text-yellow-400'}`} />
                        <div className="min-w-0">
                          <p className={`text-xs font-medium truncate ${isLightMode ? 'text-emerald-700' : 'text-yellow-400/90'}`}>
                            {savedLocationLabel}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${isLightMode ? 'text-emerald-500/70' : 'text-yellow-400/40'}`}>
                            Monitoring for brownout schedules
                          </p>
                        </div>
                      </div>
                    )}

                    {defaultAlerts.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {defaultAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={`p-3 rounded-xl border ${
                              isLightMode
                                ? 'bg-red-50/80 border-red-200/60'
                                : 'bg-red-400/8 border-red-400/15'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <Zap className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isLightMode ? 'text-red-500' : 'text-red-400'}`} />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className={`text-[11px] font-semibold ${isLightMode ? 'text-red-700' : 'text-red-300'}`}>
                                  Scheduled Brownout
                                </p>
                                <div className="space-y-1">
                                  <p className={`text-[11px] flex items-center gap-1.5 ${isLightMode ? 'text-slate-600' : 'text-white/50'}`}>
                                    <Calendar className="w-3 h-3 flex-shrink-0" />
                                    {alert.dateStr}
                                  </p>
                                  <p className={`text-[11px] flex items-center gap-1.5 ${isLightMode ? 'text-slate-600' : 'text-white/50'}`}>
                                    <Clock className="w-3 h-3 flex-shrink-0" />
                                    {alert.timeStr}
                                  </p>
                                  {alert.affectedArea && (
                                    <p className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-white/35'}`}>
                                      Area: {alert.affectedArea}
                                    </p>
                                  )}
                                </div>
                                {alert.url && (
                                  <a
                                    href={alert.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 text-[10px] font-medium mt-1 transition-colors ${
                                      isLightMode
                                        ? 'text-blue-500 hover:text-blue-700'
                                        : 'text-blue-400 hover:text-blue-300'
                                    }`}
                                  >
                                    View notice <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`text-center py-4 ${isLightMode ? 'text-slate-400' : 'text-white/25'}`}>
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No scheduled brownouts</p>
                        <p className="text-[10px] mt-1">You'll see brownout alerts here when they're posted for your area.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`text-center py-6 ${isLightMode ? 'text-slate-400' : 'text-white/30'}`}>
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-medium">No location saved</p>
                    <p className="text-[10px] mt-1">Select a city and barangay, then save it to receive alerts.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </>
  );
}
