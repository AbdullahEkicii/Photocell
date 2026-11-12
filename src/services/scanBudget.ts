import * as Device from 'expo-device';

/**
 * How hard the background scan is allowed to work. Decoding photos natively is the heavy
 * part (each full-size decode holds tens of MB), so concurrency scales with the device's
 * RAM instead of being a fixed number, and the scan yields to touches and animations.
 */
export interface ScanBudget {
  /** Photos fingerprinted at the same time. */
  fingerprintConcurrency: number;
  /** Photos blur-checked at the same time. */
  blurConcurrency: number;
  /** Rest between batches, in ms, so the UI thread gets frames. */
  pauseMs: number;
}

const GIB = 1024 * 1024 * 1024;

export function getScanBudget(): ScanBudget {
  const ram = Device.totalMemory ?? 0;
  if (ram > 0 && ram < 4 * GIB) return { fingerprintConcurrency: 1, blurConcurrency: 1, pauseMs: 70 };
  if (ram === 0 || ram < 8 * GIB) return { fingerprintConcurrency: 2, blurConcurrency: 2, pauseMs: 40 };
  return { fingerprintConcurrency: 3, blurConcurrency: 3, pauseMs: 25 };
}

/**
 * Waits until touches and animations have settled, then rests for `pauseMs`. A hard
 * 400 ms cap means a constantly busy UI can slow the scan but never starve it.
 */
export function yieldToUi(pauseMs: number): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setTimeout(resolve, pauseMs);
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(finish, { timeout: 400 });
    } else {
      setTimeout(finish, 400);
    }
  });
}
