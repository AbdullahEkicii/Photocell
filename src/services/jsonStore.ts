import * as FileSystem from 'expo-file-system/legacy';

const dir = () => (FileSystem as any).documentDirectory || '';

/** Reads a small JSON file from the app's private storage, or `fallback` when missing/corrupt. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const path = `${dir()}${name}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    return { ...fallback, ...JSON.parse(await FileSystem.readAsStringAsync(path)) };
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(`${dir()}${name}`, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not save ${name}:`, err);
  }
}

/** Local calendar day, e.g. "2026-10-30" - used to reset daily counters at the user's midnight. */
export const todayKey = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
