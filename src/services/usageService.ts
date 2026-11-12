import * as FileSystem from 'expo-file-system/legacy';

/**
 * Local usage clock used to decide when to ask for a Play Store rating. Only the
 * foreground time and the answers to the prompt are stored, on this device only.
 */

const USAGE_FILE = `${(FileSystem as any).documentDirectory || ''}photocell_usage.json`;

/** Ask once people have actually used the app for this long. */
export const REVIEW_AFTER_MS = 20 * 60 * 1000;
/** After "later", wait this long before asking again. */
const LATER_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
/** Never ask more than this many times in total. */
const MAX_ASKS = 2;

interface UsageState {
  totalMs: number;
  asks: number;
  nextAskAt: number;
  done: boolean;
}

const empty: UsageState = { totalMs: 0, asks: 0, nextAskAt: 0, done: false };

async function read(): Promise<UsageState> {
  try {
    const info = await FileSystem.getInfoAsync(USAGE_FILE);
    if (!info.exists) return { ...empty };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(USAGE_FILE)) as Partial<UsageState>;
    return { ...empty, ...parsed };
  } catch {
    return { ...empty };
  }
}

async function write(state: UsageState): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(USAGE_FILE, JSON.stringify(state));
  } catch {
    // Usage tracking must never break the app.
  }
}

let sessionStart: number | null = null;

/** Called when the app comes to the foreground. */
export function usageSessionStart(): void {
  if (sessionStart === null) sessionStart = Date.now();
}

/** Called when the app leaves the foreground: adds the session to the total. */
export async function usageSessionEnd(): Promise<void> {
  if (sessionStart === null) return;
  const elapsed = Date.now() - sessionStart;
  sessionStart = null;
  const state = await read();
  state.totalMs += Math.max(0, elapsed);
  await write(state);
}

/** True when the user has used the app long enough and has not been asked too often. */
export async function shouldAskForReview(): Promise<boolean> {
  const state = await read();
  const live = sessionStart !== null ? Date.now() - sessionStart : 0;
  if (state.done || state.asks >= MAX_ASKS) return false;
  if (Date.now() < state.nextAskAt) return false;
  return state.totalMs + live >= REVIEW_AFTER_MS;
}

/** Records that the prompt was shown. */
export async function markReviewAsked(): Promise<void> {
  const state = await read();
  state.asks += 1;
  state.nextAskAt = Date.now() + LATER_DELAY_MS;
  await write(state);
}

/** "Later": postpone without counting it as a refusal. */
export async function postponeReview(): Promise<void> {
  const state = await read();
  state.nextAskAt = Date.now() + LATER_DELAY_MS;
  await write(state);
}

/** "No thanks": never ask again. */
export async function declineReview(): Promise<void> {
  const state = await read();
  state.done = true;
  await write(state);
}
