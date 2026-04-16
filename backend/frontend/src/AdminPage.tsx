import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, MapPin, MessageSquare, Settings, Play, Trash2,
  CheckCircle2, XCircle, ChevronUp,
  RefreshCw, Sun, Moon, Home, AlertTriangle, Loader2, Pencil,
} from 'lucide-react';

type ThemeMode = 'light' | 'dark';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || '';

// ---------- Types ----------

interface LearnedLocation {
  id: number;
  municipality: string;
  barangay: string;
  location_type: string;
  location_name: string;
  source_url: string;
  verified: boolean;
  created_at: string;
}

interface CommunityReport {
  id: number;
  type: string;
  municipality?: string;
  barangay?: string;
  location_type?: string;
  location_name?: string;
  message?: string;
  status: string;
  created_at: string;
}

type Tab = 'locations' | 'reports' | 'settings';
type ReportStatus = 'confirmed' | 'not_yet_confirmed' | 'ongoing';

const STATUS_LABELS: Record<ReportStatus, string> = {
  not_yet_confirmed: 'Not Yet Confirmed',
  confirmed: 'Confirmed',
  ongoing: 'Ongoing',
};

const STATUS_COLORS_DARK: Record<string, string> = {
  not_yet_confirmed: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  confirmed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  ongoing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

const STATUS_COLORS_LIGHT: Record<string, string> = {
  not_yet_confirmed: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  ongoing: 'bg-blue-100 text-blue-800 border-blue-300',
};

// ---------- API helpers ----------

async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------- Component ----------

export default function AdminPage() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('themeMode');
    return saved === 'light' ? 'light' : 'dark';
  });
  const isLight = themeMode === 'light';

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  const [tab, setTab] = useState<Tab>('locations');
  const [locations, setLocations] = useState<LearnedLocation[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Scrape trigger state
  const [scrapeEnv, setScrapeEnv] = useState<'prod' | 'dev'>('prod');
  const [scraping, setScraping] = useState(false);

  // Expanded rows for editing
  const [editingLocId, setEditingLocId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<LearnedLocation>>({});

  const flash = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  // ---------- Fetch data ----------

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/api/admin/learned-locations');
      setLocations(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch('/api/admin/reports');
      setReports(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMaintenance = useCallback(async () => {
    try {
      const data = await adminFetch('/api/admin/maintenance');
      setMaintenanceEnabled(data.enabled);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tab === 'locations') fetchLocations();
    else if (tab === 'reports') fetchReports();
    else if (tab === 'settings') fetchMaintenance();
  }, [tab, fetchLocations, fetchReports, fetchMaintenance]);

  // ---------- Actions ----------

  const toggleVerified = async (loc: LearnedLocation) => {
    try {
      await adminFetch(`/api/admin/learned-locations/${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ verified: !loc.verified }),
      });
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, verified: !l.verified } : l)));
      flash(loc.verified ? 'Unverified' : 'Verified');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteLocation = async (id: number) => {
    try {
      await adminFetch(`/api/admin/learned-locations/${id}`, { method: 'DELETE' });
      setLocations((prev) => prev.filter((l) => l.id !== id));
      flash('Deleted');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveLocationEdit = async (id: number) => {
    try {
      const updated = await adminFetch(`/api/admin/learned-locations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      setEditingLocId(null);
      setEditForm({});
      flash('Updated');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const changeReportStatus = async (id: number, status: ReportStatus) => {
    try {
      await adminFetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      flash(`Status → ${STATUS_LABELS[status]}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteReport = async (id: number) => {
    try {
      await adminFetch(`/api/admin/reports/${id}`, { method: 'DELETE' });
      setReports((prev) => prev.filter((r) => r.id !== id));
      flash('Deleted');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleMaintenance = async () => {
    try {
      const data = await adminFetch('/api/admin/maintenance', {
        method: 'PUT',
        body: JSON.stringify({ enabled: !maintenanceEnabled }),
      });
      setMaintenanceEnabled(data.enabled);
      flash(data.enabled ? 'Maintenance ON' : 'Maintenance OFF');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const triggerScrape = async () => {
    setScraping(true);
    setError(null);
    try {
      const data = await adminFetch('/api/admin/trigger-scrape', {
        method: 'POST',
        body: JSON.stringify({ environment: scrapeEnv }),
      });
      flash(data.message || 'Workflow dispatched');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setScraping(false);
    }
  };

  // ---------- Style helpers ----------

  const containerBg = isLight
    ? 'bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100'
    : 'bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900';
  const cardBg = isLight
    ? 'bg-white/70 border border-amber-200/70 shadow-2xl shadow-amber-200/40'
    : 'bg-white/10 border border-white/20 shadow-2xl';
  const textMain = isLight ? 'text-slate-800' : 'text-white';
  const textMuted = isLight ? 'text-slate-500' : 'text-white/50';
  const inputClass = isLight
    ? 'w-full px-3 py-2 bg-white/80 border border-amber-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-amber-500 transition-colors'
    : 'w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors';
  const btnPrimary =
    'px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-xl text-sm transition-colors';
  const btnDanger = isLight
    ? 'px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-medium transition-colors'
    : 'px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium transition-colors';
  const tabBase = (active: boolean) =>
    `px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
      active
        ? isLight
          ? 'bg-amber-200 text-slate-800'
          : 'bg-white/20 text-white'
        : isLight
        ? 'text-slate-500 hover:bg-amber-100'
        : 'text-white/50 hover:bg-white/10'
    }`;
  const statusColors = isLight ? STATUS_COLORS_LIGHT : STATUS_COLORS_DARK;

  // ---------- Render ----------

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${containerBg}`}>
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-yellow-400'}`} />
            <h1 className={`text-xl font-bold ${textMain}`}>Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-amber-100 text-slate-600' : 'hover:bg-white/10 text-white/60'}`}
              title="Back to main"
            >
              <Home className="w-5 h-5" />
            </a>
            <button
              onClick={() => setThemeMode((p) => (p === 'dark' ? 'light' : 'dark'))}
              className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-amber-100 text-slate-600' : 'hover:bg-white/10 text-white/60'}`}
              title="Toggle theme"
            >
              {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Flash messages */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}
            >
              <CheckCircle2 className="w-4 h-4 inline mr-2" />
              {successMsg}
            </motion.div>
          )}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${isLight ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}
            >
              <XCircle className="w-4 h-4 inline mr-2" />
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button className={tabBase(tab === 'locations')} onClick={() => setTab('locations')}>
            <MapPin className="w-4 h-4 inline mr-1.5" />
            Learned Locations
          </button>
          <button className={tabBase(tab === 'reports')} onClick={() => setTab('reports')}>
            <MessageSquare className="w-4 h-4 inline mr-1.5" />
            Reports
          </button>
          <button className={tabBase(tab === 'settings')} onClick={() => setTab('settings')}>
            <Settings className="w-4 h-4 inline mr-1.5" />
            Settings
          </button>
        </div>

        {/* Tab content */}
        <div className={`backdrop-blur-xl rounded-3xl overflow-hidden ${cardBg}`}>
          {/* ============ LEARNED LOCATIONS TAB ============ */}
          {tab === 'locations' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-bold ${textMain}`}>Learned Locations</h2>
                <button onClick={fetchLocations} className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`} title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''} ${textMuted}`} />
                </button>
              </div>
              <p className={`text-xs ${textMuted}`}>
                Verified locations are used during scraping to correct misplaced affected areas.
              </p>
              {loading ? (
                <div className={`text-center py-8 ${textMuted}`}>
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              ) : locations.length === 0 ? (
                <p className={`text-center py-8 text-sm ${textMuted}`}>No learned locations yet.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {locations.map((loc) => (
                    <div
                      key={loc.id}
                      className={`rounded-2xl p-4 transition-colors ${isLight ? 'bg-white/60 border border-amber-100 hover:bg-white/80' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm ${textMain}`}>{loc.location_name}</div>
                          <div className={`text-xs mt-1 ${textMuted}`}>
                            {loc.barangay}, {loc.municipality} &middot; {loc.location_type}
                          </div>
                          {loc.source_url && (
                            <a
                              href={loc.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-xs mt-1 inline-block ${isLight ? 'text-blue-600 hover:text-blue-800' : 'text-blue-400 hover:text-blue-300'}`}
                            >
                              source
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleVerified(loc)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              loc.verified
                                ? isLight
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : isLight
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-white/5 text-white/40 border-white/10'
                            }`}
                            title={loc.verified ? 'Click to unverify' : 'Click to verify'}
                          >
                            {loc.verified ? (
                              <><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Verified</>
                            ) : (
                              'Unverified'
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (editingLocId === loc.id) {
                                setEditingLocId(null);
                                setEditForm({});
                              } else {
                                setEditingLocId(loc.id);
                                setEditForm({
                                  municipality: loc.municipality,
                                  barangay: loc.barangay,
                                  location_type: loc.location_type,
                                  location_name: loc.location_name,
                                });
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-amber-100 text-slate-500' : 'hover:bg-white/10 text-white/40'}`}
                            title="Edit"
                          >
                            {editingLocId === loc.id ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                          </button>
                          <button onClick={() => deleteLocation(loc.id)} className={btnDanger} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Inline edit form */}
                      <AnimatePresence>
                        {editingLocId === loc.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-dashed border-white/10">
                              <div>
                                <label className={`text-xs ${textMuted}`}>Municipality</label>
                                <input
                                  value={editForm.municipality || ''}
                                  onChange={(e) => setEditForm((f) => ({ ...f, municipality: e.target.value }))}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${textMuted}`}>Barangay</label>
                                <input
                                  value={editForm.barangay || ''}
                                  onChange={(e) => setEditForm((f) => ({ ...f, barangay: e.target.value }))}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${textMuted}`}>Location Name</label>
                                <input
                                  value={editForm.location_name || ''}
                                  onChange={(e) => setEditForm((f) => ({ ...f, location_name: e.target.value }))}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${textMuted}`}>Type</label>
                                <select
                                  value={editForm.location_type || 'landmark'}
                                  onChange={(e) => setEditForm((f) => ({ ...f, location_type: e.target.value }))}
                                  className={inputClass}
                                >
                                  <option value="purok">Purok</option>
                                  <option value="landmark">Landmark</option>
                                  <option value="street">Street</option>
                                  <option value="establishment">Establishment</option>
                                </select>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                onClick={() => { setEditingLocId(null); setEditForm({}); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-white/50 hover:bg-white/10'}`}
                              >
                                Cancel
                              </button>
                              <button onClick={() => saveLocationEdit(loc.id)} className={btnPrimary + ' !px-3 !py-1.5 !text-xs'}>
                                Save
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ REPORTS TAB ============ */}
          {tab === 'reports' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-bold ${textMain}`}>Community Reports</h2>
                <button onClick={fetchReports} className={`p-2 rounded-lg transition-colors ${isLight ? 'hover:bg-amber-100' : 'hover:bg-white/10'}`} title="Refresh">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''} ${textMuted}`} />
                </button>
              </div>
              {loading ? (
                <div className={`text-center py-8 ${textMuted}`}>
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              ) : reports.length === 0 ? (
                <p className={`text-center py-8 text-sm ${textMuted}`}>No reports yet.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-2xl p-4 transition-colors ${isLight ? 'bg-white/60 border border-amber-100 hover:bg-white/80' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${statusColors[r.status] || statusColors.not_yet_confirmed}`}>
                              {STATUS_LABELS[r.status as ReportStatus] || r.status}
                            </span>
                            <span className={`text-xs ${textMuted}`}>
                              {r.type === 'location_report' ? 'Location Report' : r.type === 'suggestion' ? 'Suggestion' : r.type}
                            </span>
                          </div>
                          {r.type === 'location_report' && (
                            <div className={`text-sm ${textMain}`}>
                              <span className="font-medium">{r.location_name}</span>
                              <span className={`text-xs ml-2 ${textMuted}`}>
                                {r.location_type} &middot; {r.barangay}, {r.municipality}
                              </span>
                            </div>
                          )}
                          {r.message && (
                            <p className={`text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>{r.message}</p>
                          )}
                          <p className={`text-xs mt-1 ${textMuted}`}>
                            {new Date(r.created_at).toLocaleString('en-PH', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: 'numeric', minute: '2-digit', hour12: true,
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Status dropdown */}
                          <select
                            value={r.status}
                            onChange={(e) => changeReportStatus(r.id, e.target.value as ReportStatus)}
                            className={`${inputClass} !w-auto !py-1.5 !px-2 !text-xs`}
                          >
                            <option value="not_yet_confirmed">Not Yet Confirmed</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="ongoing">Ongoing</option>
                          </select>
                          <button onClick={() => deleteReport(r.id)} className={btnDanger} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ SETTINGS TAB ============ */}
          {tab === 'settings' && (
            <div className="p-6 space-y-6">
              <h2 className={`text-lg font-bold ${textMain}`}>Settings</h2>

              {/* Maintenance Mode */}
              <div className={`rounded-2xl p-5 ${isLight ? 'bg-white/60 border border-amber-100' : 'bg-white/5 border border-white/10'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-semibold text-sm ${textMain}`}>
                      <AlertTriangle className="w-4 h-4 inline mr-2" />
                      Maintenance Mode
                    </h3>
                    <p className={`text-xs mt-1 ${textMuted}`}>
                      When enabled, the main app shows a maintenance page to all visitors.
                    </p>
                  </div>
                  <button
                    onClick={toggleMaintenance}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      maintenanceEnabled
                        ? 'bg-yellow-400'
                        : isLight
                        ? 'bg-slate-300'
                        : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Trigger Scrape */}
              <div className={`rounded-2xl p-5 ${isLight ? 'bg-white/60 border border-amber-100' : 'bg-white/5 border border-white/10'}`}>
                <h3 className={`font-semibold text-sm mb-3 ${textMain}`}>
                  <Play className="w-4 h-4 inline mr-2" />
                  Run Scraper (GitHub Actions)
                </h3>
                <p className={`text-xs mb-4 ${textMuted}`}>
                  Triggers the scraper workflow on GitHub Actions. This is the same as clicking "Run workflow" in the Actions tab.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={scrapeEnv}
                    onChange={(e) => setScrapeEnv(e.target.value as 'prod' | 'dev')}
                    className={`${inputClass} !w-auto`}
                  >
                    <option value="prod">Production</option>
                    <option value="dev">Development</option>
                  </select>
                  <button onClick={triggerScrape} disabled={scraping} className={btnPrimary}>
                    {scraping ? (
                      <><Loader2 className="w-4 h-4 inline mr-1.5 animate-spin" />Dispatching...</>
                    ) : (
                      <><Play className="w-4 h-4 inline mr-1.5" />Run Scraper</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
