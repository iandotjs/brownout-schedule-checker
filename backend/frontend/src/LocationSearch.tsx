import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Search, LocateFixed, Loader2 } from 'lucide-react';
import { useGeolocation } from './useGeolocation';

interface Location {
  code: string;
  name: string;
  barangays: { code: string; name: string }[];
}

interface LocationSearchProps {
  locations: Location[];
  isLightMode: boolean;
  onSelect: (cityCode: string, barangayCode: string) => void;
}

const MAX_RESULTS = 8;

const normalize = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\bSTA\b/g, 'SANTA')
    .replace(/\bSTO\b/g, 'SANTO')
    .replace(/\bPOB\b/g, 'POBLACION')
    .replace(/\s+/g, ' ')
    .trim();

export default function LocationSearch({ locations, isLightMode, onSelect }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'failed' | 'partial'>('idle');
  const { detectLocation } = useGeolocation(locations);
  const listId = useId();

  const index = useMemo(
    () =>
      locations.flatMap((city) =>
        city.barangays.map((b) => ({
          cityCode: city.code,
          barangayCode: b.code,
          barangayName: b.name,
          cityName: city.name,
          brgyNorm: normalize(b.name),
          fullNorm: normalize(`${b.name} ${city.name}`),
        }))
      ),
    [locations]
  );

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    const tokens = q.split(' ');
    return index
      .filter((e) => tokens.every((t) => e.fullNorm.includes(t)))
      .sort((a, b) => Number(b.brgyNorm.startsWith(q)) - Number(a.brgyNorm.startsWith(q)) || a.brgyNorm.localeCompare(b.brgyNorm))
      .slice(0, MAX_RESULTS);
  }, [index, query]);

  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    onSelect(r.cityCode, r.barangayCode);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && results.length > 0) {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleUseLocation = async () => {
    setGeoStatus('loading');
    const result = await detectLocation();
    if (!result) {
      setGeoStatus('failed');
      return;
    }
    onSelect(result.cityCode, result.barangayCode);
    setGeoStatus(result.barangayCode ? 'idle' : 'partial');
  };

  const showList = open && query.trim().length > 0;
  const inputClass = isLightMode
    ? 'bg-white/90 border-amber-200 text-slate-800 placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-400/30'
    : 'bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-yellow-400 focus:ring-yellow-400/20';
  const listClass = isLightMode ? 'bg-white border-amber-200 text-slate-800' : 'bg-slate-900 border-white/20 text-white';
  const mutedClass = isLightMode ? 'text-slate-600' : 'text-white/75';

  return (
    <div className="space-y-2">
      <label htmlFor={`${listId}-input`} className={`block font-medium ${isLightMode ? 'text-slate-700' : 'text-white/90'}`}>
        Find your barangay
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${mutedClass}`} aria-hidden="true" />
          <input
            id={`${listId}-input`}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={showList}
            aria-controls={`${listId}-list`}
            aria-activedescendant={showList && results[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
            placeholder="e.g. Sta. Isabel, Dipolog"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className={`w-full pl-9 pr-3 py-3 text-sm md:text-base rounded-xl md:rounded-2xl border focus:outline-none focus:ring-2 transition-colors ${inputClass}`}
          />
          {showList && (
            <ul
              id={`${listId}-list`}
              role="listbox"
              className={`absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border shadow-xl ${listClass}`}
            >
              {results.length === 0 ? (
                <li className={`px-4 py-3 text-sm ${mutedClass}`}>No matching barangay</li>
              ) : (
                results.map((r, i) => (
                  <li
                    key={`${r.cityCode}-${r.barangayCode}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`cursor-pointer px-4 py-2.5 text-sm ${
                      i === activeIndex ? (isLightMode ? 'bg-amber-100' : 'bg-white/15') : ''
                    }`}
                  >
                    <span className="font-semibold">{r.barangayName}</span>
                    <span className={mutedClass}>, {r.cityName}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleUseLocation()}
          disabled={geoStatus === 'loading'}
          title="Use my current location"
          aria-label="Use my current location"
          className={`flex-shrink-0 inline-flex items-center gap-2 px-3 md:px-4 rounded-xl md:rounded-2xl border text-sm font-semibold transition-colors disabled:opacity-60 ${
            isLightMode ? 'bg-white/90 border-amber-200 text-slate-800 hover:bg-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
          }`}
        >
          {geoStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="w-4 h-4" aria-hidden="true" />}
          <span className="hidden sm:inline">Near me</span>
        </button>
      </div>
      {geoStatus === 'failed' && (
        <p className={`text-xs ${mutedClass}`} role="status">Couldn't detect your barangay. Please search or pick from the list below.</p>
      )}
      {geoStatus === 'partial' && (
        <p className={`text-xs ${mutedClass}`} role="status">Found your city — please pick your barangay below.</p>
      )}
    </div>
  );
}
