const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

interface DayKey { y: number; m: number; d: number }
interface MinuteRange { start: number; end: number }
export interface TimeWindow { start: number; end: number }

export type ScheduleStatus = 'ongoing' | 'today' | 'tomorrow' | 'upcoming' | 'unknown';

export interface ScheduleTiming {
  status: ScheduleStatus;
  isPast: boolean;
  daysAway: number;
  windows: TimeWindow[];
  next: TimeWindow | null;
  hasTimes: boolean;
  durationMinutes: number | null;
}

const manilaToday = (now: number): number => {
  const d = new Date(now + MANILA_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Handles "April 14, 2026", "April 15 & 16, 2026", "15-16 April 2026", "April 30 & May 1, 2026"
const parseDates = (raw: string[], now: number): DayKey[] => {
  const out: DayKey[] = [];
  const fallbackYear = new Date(now + MANILA_OFFSET_MS).getUTCFullYear();

  for (const str of raw) {
    const tokens = String(str).toLowerCase().match(/[a-z]+|\d+/g) ?? [];
    const yearTok = tokens.find((t) => /^\d{4}$/.test(t));
    const year = yearTok ? Number(yearTok) : fallbackYear;
    let month = -1;
    let pending: number[] = [];

    for (const t of tokens) {
      if (/^[a-z]+$/.test(t)) {
        const idx = t.length >= 3 ? MONTHS.indexOf(t.slice(0, 3)) : -1;
        if (idx >= 0) {
          month = idx;
          pending.forEach((d) => out.push({ y: year, m: month, d }));
          pending = [];
        }
      } else if (t.length <= 2) {
        const day = Number(t);
        if (day < 1 || day > 31) continue;
        if (month >= 0) out.push({ y: year, m: month, d: day });
        else pending.push(day);
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((k) => {
    const id = `${k.y}-${k.m}-${k.d}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

interface Clock { h: number; min: number; mer: 'am' | 'pm' | null }

const parseClock = (part: string): Clock | null => {
  const s = part.toLowerCase().replace(/[.\s]/g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|nn|noon|mn)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 12 || min > 59) return null;
  const suffix = m[3];
  if (suffix === 'nn' || suffix === 'noon') return { h: 12, min, mer: 'pm' };
  if (suffix === 'mn') return { h: 12, min, mer: 'am' };
  if (h === 0) h = 12;
  return { h, min, mer: (suffix as 'am' | 'pm' | undefined) ?? null };
};

const toMinutes = (c: Clock, mer: 'am' | 'pm'): number => {
  const h24 = mer === 'pm' ? (c.h % 12) + 12 : c.h % 12;
  return h24 * 60 + c.min;
};

// Handles "8:30AM - 5:00PM", "8AM to 12NN", "8:00 - 5:00 PM"
const parseTimeRanges = (raw: string[]): MinuteRange[] => {
  const out: MinuteRange[] = [];
  const segments = raw.flatMap((str) => String(str).split(/\s*(?:&|,|;|\band\b)\s*/i));
  for (const str of segments) {
    const parts = str.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
    if (parts.length < 2) continue;
    const a = parseClock(parts[0]);
    const b = parseClock(parts[1]);
    if (!a || !b) continue;

    const endMer = b.mer ?? (b.h >= 1 && b.h <= 6 ? 'pm' : 'am');
    let startMer = a.mer ?? endMer;
    if (!a.mer && toMinutes(a, startMer) >= toMinutes(b, endMer)) startMer = 'am';

    const start = toMinutes(a, startMer);
    let end = toMinutes(b, endMer);
    if (end <= start) end += 24 * 60;
    out.push({ start, end });
  }
  return out;
};

export const getScheduleTiming = (dates: string[], times: string[], now = Date.now()): ScheduleTiming => {
  const days = parseDates(dates, now);
  const ranges = parseTimeRanges(times);
  const hasTimes = ranges.length > 0;
  const effectiveRanges = hasTimes ? ranges : [{ start: 0, end: 24 * 60 }];

  const windows = days
    .flatMap((day) =>
      effectiveRanges.map((r) => ({
        start: Date.UTC(day.y, day.m, day.d, 0, r.start) - MANILA_OFFSET_MS,
        end: Date.UTC(day.y, day.m, day.d, 0, r.end) - MANILA_OFFSET_MS,
      }))
    )
    .sort((x, y) => x.start - y.start);

  const durationMinutes = hasTimes ? ranges.reduce((sum, r) => sum + (r.end - r.start), 0) : null;

  if (windows.length === 0) {
    return { status: 'unknown', isPast: false, daysAway: 0, windows, next: null, hasTimes, durationMinutes };
  }

  const next = windows.find((w) => w.end > now) ?? null;
  if (!next) {
    return { status: 'unknown', isPast: true, daysAway: 0, windows, next: null, hasTimes, durationMinutes };
  }

  const daysAway = Math.round((manilaToday(next.start) - manilaToday(now)) / DAY_MS);
  let status: ScheduleStatus;
  if (next.start <= now) status = 'ongoing';
  else if (daysAway <= 0) status = 'today';
  else if (daysAway === 1) status = 'tomorrow';
  else status = 'upcoming';

  return { status, isPast: false, daysAway, windows, next, hasTimes, durationMinutes };
};

export const formatManilaTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true });

export const formatManilaDate = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' });

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? 'hr' : 'hrs'}`;
};

const escapeIcs = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

const toIcsDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const foldLine = (line: string): string => {
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 73) chunks.push(line.slice(i, i + 73));
  return chunks.join('\r\n ');
};

export interface CalendarEvent {
  uid: string;
  start: number;
  end: number;
  title: string;
  description: string;
  location: string;
}

export const buildIcs = (events: CalendarEvent[]): string => {
  const stamp = toIcsDate(Date.now());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZN Brownout Schedule//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDate(e.start)}`,
      `DTEND:${toIcsDate(e.end)}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      `DESCRIPTION:${escapeIcs(e.description)}`,
      `LOCATION:${escapeIcs(e.location)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Scheduled brownout in 1 hour',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
};
