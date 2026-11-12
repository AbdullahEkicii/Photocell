import { AccessibilityInfo } from 'react-native';
import * as Device from 'expo-device';
import { FadeIn } from 'react-native-reanimated';

/**
 * Motion budget, picked once at startup from the device:
 *  - full:    springs, staggered entrances, card motion (mid/high-end phones)
 *  - reduced: short fades only (low-RAM phones, or Android API < 28)
 *  - none:    no motion at all (very low RAM, or the system "remove animations" setting)
 *
 * Screens never pick an animation for a low-end device themselves; they wrap their
 * `entering` prop in enter(), which degrades it to the tier above.
 */
export type MotionTier = 'full' | 'reduced' | 'none';

const GIB = 1024 * 1024 * 1024;

let tier: MotionTier = 'full';

/** Works out the tier from RAM and API level. Safe to call before any render. */
export function initMotionTier(): MotionTier {
  const ram = Device.totalMemory ?? 0;
  const apiLevel = typeof Device.platformApiLevel === 'number' ? Device.platformApiLevel : 0;

  if (ram > 0 && ram < 3 * GIB) tier = 'none';
  else if (ram > 0 && ram < 6 * GIB) tier = 'reduced';
  else if (ram === 0) tier = 'reduced'; // unknown: stay on the cheaper side
  else tier = 'full';

  if (apiLevel > 0 && apiLevel < 28 && tier === 'full') tier = 'reduced';

  // The system "Remove animations" / reduce motion setting always wins.
  AccessibilityInfo.isReduceMotionEnabled()
    .then((reduce) => {
      if (reduce) tier = 'none';
    })
    .catch(() => {});

  return tier;
}

export const getMotionTier = (): MotionTier => tier;

/**
 * Returns the entrance animation for the current tier. Pass the full-quality animation;
 * it comes back as-is on capable phones, as a short fade on reduced ones, and as
 * undefined (no animation) when motion is off.
 */
export function enter<T>(full: T): T | ReturnType<typeof FadeIn.duration> | undefined {
  if (tier === 'none') return undefined;
  if (tier === 'reduced') return FadeIn.duration(160);
  return full;
}
