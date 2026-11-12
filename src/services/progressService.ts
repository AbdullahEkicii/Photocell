import * as FileSystem from 'expo-file-system/legacy';

/**
 * Per-day record of freed space, used for "this week" totals, the cleaning streak and
 * the badges. Only real bytes that were actually freed are recorded (the callers in
 * cacheCleaner pass the measured sizes), so every number shown is measured.
 */

const PROGRESS_FILE = `${(FileSystem as any).documentDirectory || ''}photocell_progress.json`;
const KEEP_DAYS = 120;
const GIB = 1024 * 1024 * 1024;

interface DayEntry {
  /** Local date, YYYY-MM-DD. */
  day: string;
  bytes: number;
}

interface ProgressFile {
  days: DayEntry[];
  /** Never trimmed, so badges earned once stay earned. */
  lifetimeBytes: number;
}

export interface Badge {
  id: 'first_clean' | 'gb_1' | 'gb_5' | 'gb_10' | 'streak_3' | 'streak_7' | 'streak_30';
  unlocked: boolean;
}

export interface ProgressSummary {
  weekBytes: number;
  totalBytes: number;
  /** Consecutive days with at least one cleanup, ending today or yesterday. */
  streak: number;
  cleanedToday: boolean;
  badges: Badge[];
}

export const dayKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

async function readProgress(): Promise<ProgressFile> {
  try {
    const info = await FileSystem.getInfoAsync(PROGRESS_FILE);
    if (!info.exists) return { days: [], lifetimeBytes: 0 };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(PROGRESS_FILE)) as ProgressFile;
    return {
      days: Array.isArray(parsed.days) ? parsed.days : [],
      lifetimeBytes: Number(parsed.lifetimeBytes) || 0,
    };
  } catch {
    return { days: [], lifetimeBytes: 0 };
  }
}

// Writes are chained so two cleanups finishing together cannot overwrite each other.
let writeQueue: Promise<void> = Promise.resolve();

/** Adds freed bytes to today's total. Errors are swallowed: progress must never block a cleanup. */
export function recordProgress(freedBytes: number): Promise<void> {
  if (!freedBytes || freedBytes <= 0) return Promise.resolve();
  writeQueue = writeQueue.then(() => writeProgress(freedBytes));
  return writeQueue;
}

async function writeProgress(freedBytes: number): Promise<void> {
  try {
    const progress = await readProgress();
    const today = dayKey();
    const existing = progress.days.find((entry) => entry.day === today);
    if (existing) existing.bytes += freedBytes;
    else progress.days.push({ day: today, bytes: freedBytes });

    progress.days.sort((a, b) => (a.day < b.day ? -1 : 1));
    const trimmed = progress.days.slice(-KEEP_DAYS);
    const lifetimeBytes = progress.lifetimeBytes + freedBytes;
    await FileSystem.writeAsStringAsync(PROGRESS_FILE, JSON.stringify({ days: trimmed, lifetimeBytes }));
  } catch (err) {
    console.warn('Could not record progress:', err);
  }
}

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

/** Streak counts back from today; if today has no cleanup yet, it starts from yesterday. */
function computeStreak(cleanedDays: Set<string>): number {
  let offset = cleanedDays.has(daysAgo(0)) ? 0 : 1;
  let streak = 0;
  while (cleanedDays.has(daysAgo(offset))) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

export async function getProgressSummary(): Promise<ProgressSummary> {
  const { days, lifetimeBytes } = await readProgress();
  const cleanedDays = new Set(days.filter((d) => d.bytes > 0).map((d) => d.day));

  const weekStart = daysAgo(6);
  const weekBytes = days
    .filter((d) => d.day >= weekStart)
    .reduce((sum, d) => sum + d.bytes, 0);
  const totalBytes = Math.max(lifetimeBytes, days.reduce((sum, d) => sum + d.bytes, 0));
  const streak = computeStreak(cleanedDays);

  const badges: Badge[] = [
    { id: 'first_clean', unlocked: totalBytes > 0 },
    { id: 'gb_1', unlocked: totalBytes >= GIB },
    { id: 'gb_5', unlocked: totalBytes >= 5 * GIB },
    { id: 'gb_10', unlocked: totalBytes >= 10 * GIB },
    { id: 'streak_3', unlocked: streak >= 3 },
    { id: 'streak_7', unlocked: streak >= 7 },
    { id: 'streak_30', unlocked: streak >= 30 },
  ];

  return {
    weekBytes,
    totalBytes,
    streak,
    cleanedToday: cleanedDays.has(daysAgo(0)),
    badges,
  };
}
