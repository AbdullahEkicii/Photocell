import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { readJson, writeJson } from '../../services/jsonStore';

/**
 * Whether glass effects are on. Two independent reasons turn them off:
 *  - the user's own switch in Settings ("Glass effects"), which also makes sense as a
 *    battery/performance option on older phones,
 *  - the system "Reduce Transparency" setting (iOS), which the HIG requires us to honour.
 * With glass off every surface falls back to an opaque, high-contrast fill.
 */
const FILE = 'photocell_ui.json';

let userEnabled = true;
let systemReduceTransparency = false;
let reduceTransparencyListening = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export const isGlassEnabled = () => userEnabled && !systemReduceTransparency;

export async function initGlassSettings(): Promise<void> {
  const saved = await readJson(FILE, { glassEnabled: true });
  userEnabled = saved.glassEnabled !== false;

  if (Platform.OS === 'ios') {
    try {
      systemReduceTransparency = await AccessibilityInfo.isReduceTransparencyEnabled();
      if (!reduceTransparencyListening) {
        reduceTransparencyListening = true;
        AccessibilityInfo.addEventListener('reduceTransparencyChanged', (enabled) => {
          systemReduceTransparency = enabled;
          notify();
        });
      }
    } catch {
      // Keep the default.
    }
  }
  notify();
}

export function setGlassEnabled(enabled: boolean): void {
  userEnabled = enabled;
  writeJson(FILE, { glassEnabled: enabled });
  notify();
}

export function useGlassEnabled(): boolean {
  const [value, setValue] = useState(isGlassEnabled());
  useEffect(() => {
    const update = () => setValue(isGlassEnabled());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}

/** The user's own switch (what the Settings toggle shows), ignoring system settings. */
export function useGlassUserSetting(): boolean {
  const [value, setValue] = useState(userEnabled);
  useEffect(() => {
    const update = () => setValue(userEnabled);
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}
