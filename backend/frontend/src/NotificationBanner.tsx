import { motion } from 'motion/react';
import { Bell, BellOff, LogOut, MapPin, User, Zap } from 'lucide-react';
import { useAuth } from './AuthContext';
import type { UserProfile } from './AuthContext';

interface NotificationBannerProps {
  isLightMode: boolean;
  onLoginClick: () => void;
  locations: { code: string; name: string; barangays: { code: string; name: string }[] }[];
  selectedCity: string;
  selectedBarangay: string;
}

export default function NotificationBanner({
  isLightMode,
  onLoginClick,
  locations,
  selectedCity,
  selectedBarangay,
}: NotificationBannerProps) {
  const { user, profile, signOut, saveProfile } = useAuth();

  const handleSaveLocation = async () => {
    if (!selectedCity || !selectedBarangay) return;
    await saveProfile({
      default_city: selectedCity,
      default_barangay: selectedBarangay,
      notifications_enabled: true,
    });
  };

  const handleToggleNotifications = async () => {
    if (!profile) return;
    await saveProfile({ notifications_enabled: !profile.notifications_enabled } as Partial<UserProfile>);
  };

  const barangayName =
    locations
      .find((l) => l.code === selectedCity)
      ?.barangays.find((b) => b.code === selectedBarangay)?.name ?? '';

  const savedCityName = locations.find((l) => l.code === profile?.default_city)?.name ?? '';
  const savedBarangayName =
    locations
      .find((l) => l.code === profile?.default_city)
      ?.barangays.find((b) => b.code === profile?.default_barangay)?.name ?? '';

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
        {/* Subtle electric shimmer */}
        <div
          className={`absolute inset-0 pointer-events-none ${
            isLightMode
              ? 'bg-gradient-to-r from-amber-100/60 via-transparent to-orange-100/40'
              : 'bg-gradient-to-r from-yellow-400/5 via-transparent to-orange-400/5'
          }`}
        />

        <div className="relative flex flex-col sm:flex-row items-center gap-3 p-4">
          {/* Icon */}
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
              isLightMode
                ? 'bg-amber-100 text-amber-600'
                : 'bg-yellow-400/15 text-yellow-400'
            }`}
          >
            <Zap className="w-4 h-4" fill="currentColor" />
          </div>

          {/* Text */}
          <p
            className={`text-sm flex-1 text-center sm:text-left leading-relaxed ${
              isLightMode ? 'text-slate-600' : 'text-white/70'
            }`}
          >
            Get notified before brownouts hit your area.
          </p>

          {/* CTA Button */}
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
  const hasSavedLocation = profile?.default_city && profile?.default_barangay;
  const currentMatchesSaved =
    selectedCity === profile?.default_city && selectedBarangay === profile?.default_barangay;
  const canSave = selectedCity && selectedBarangay && !currentMatchesSaved;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`rounded-2xl border p-4 space-y-3 ${
        isLightMode
          ? 'bg-emerald-50/80 border-emerald-200/70'
          : 'bg-white/5 border-white/10'
      }`}
    >
      {/* Top row: user info + sign out */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 text-xs min-w-0 ${
            isLightMode ? 'text-slate-500' : 'text-white/50'
          }`}
        >
          <div
            className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
              isLightMode ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-400/15 text-emerald-400'
            }`}
          >
            <User className="w-3 h-3" />
          </div>
          <span className="truncate max-w-[160px] md:max-w-xs">{user.email}</span>
        </div>

        <button
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

      {/* Saved location info */}
      {hasSavedLocation && (
        <div
          className={`flex items-center gap-1.5 text-xs ${
            isLightMode ? 'text-emerald-700' : 'text-emerald-300/80'
          }`}
        >
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            Default: {savedBarangayName}, {savedCityName}
          </span>
          {profile.notifications_enabled && (
            <span
              className={`ml-auto flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isLightMode
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-emerald-400/15 text-emerald-400'
              }`}
            >
              <Bell className="w-2.5 h-2.5" />
              On
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {(canSave || hasSavedLocation) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {canSave && (
            <button
              onClick={handleSaveLocation}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                isLightMode
                  ? 'bg-slate-900 text-white hover:bg-slate-700'
                  : 'bg-yellow-400 text-slate-900 hover:bg-yellow-300'
              }`}
            >
              <MapPin className="w-3 h-3" />
              Save {barangayName ? `"${barangayName}"` : 'location'} as default
            </button>
          )}

          {hasSavedLocation && (
            <button
              onClick={handleToggleNotifications}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                profile.notifications_enabled
                  ? isLightMode
                    ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    : 'bg-white/8 text-white/50 hover:bg-white/12'
                  : isLightMode
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
              }`}
            >
              {profile.notifications_enabled ? (
                <BellOff className="w-3 h-3" />
              ) : (
                <Bell className="w-3 h-3" />
              )}
              {profile.notifications_enabled ? 'Disable notifications' : 'Enable notifications'}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
