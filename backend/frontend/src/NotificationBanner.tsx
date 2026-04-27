import { motion } from 'motion/react';
import { Bell, LogOut, MapPin, User } from 'lucide-react';
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
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3 ${
          isLightMode
            ? 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/70'
            : 'bg-gradient-to-r from-yellow-400/10 to-orange-400/10 border border-yellow-400/20'
        }`}
      >
        <Bell className={`w-5 h-5 flex-shrink-0 ${isLightMode ? 'text-amber-500' : 'text-yellow-400'}`} />
        <p className={`text-sm flex-1 text-center sm:text-left ${isLightMode ? 'text-slate-700' : 'text-white/80'}`}>
          Get notified before brownouts hit your area.
        </p>
        <button
          onClick={onLoginClick}
          className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            isLightMode
              ? 'bg-gradient-to-r from-emerald-400 to-cyan-500 text-white hover:from-emerald-500 hover:to-cyan-600'
              : 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black hover:from-yellow-300 hover:to-orange-300'
          }`}
        >
          Login / Register
        </button>
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
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 space-y-3 ${
        isLightMode
          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/70'
          : 'bg-gradient-to-r from-emerald-400/10 to-teal-400/10 border border-emerald-400/20'
      }`}
    >
      {/* Top row: user info + sign out */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex items-center gap-2 text-sm ${isLightMode ? 'text-slate-600' : 'text-white/60'}`}>
          <User className="w-4 h-4" />
          <span className="truncate max-w-[180px] md:max-w-xs">{user.email}</span>
        </div>
        <button
          onClick={signOut}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isLightMode
              ? 'text-slate-500 hover:bg-slate-100'
              : 'text-white/40 hover:bg-white/10'
          }`}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>

      {/* Saved location info */}
      {hasSavedLocation && (
        <div className={`flex items-center gap-2 text-xs ${isLightMode ? 'text-emerald-700' : 'text-emerald-300'}`}>
          <MapPin className="w-3.5 h-3.5" />
          Default: {savedBarangayName}, {savedCityName}
          {profile.notifications_enabled && (
            <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isLightMode ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-400/20 text-emerald-300'}`}>
              Notifications on
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {canSave && (
          <button
            onClick={handleSaveLocation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              isLightMode
                ? 'bg-cyan-500 text-white hover:bg-cyan-600'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Save {barangayName ? `"${barangayName}"` : 'location'} as default
          </button>
        )}
        {hasSavedLocation && (
          <button
            onClick={handleToggleNotifications}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              profile.notifications_enabled
                ? isLightMode
                  ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  : 'bg-white/10 text-white/60 hover:bg-white/15'
                : isLightMode
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            {profile.notifications_enabled ? 'Turn off notifications' : 'Enable notifications'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
