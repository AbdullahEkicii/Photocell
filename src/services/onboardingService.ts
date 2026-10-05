import * as FileSystem from 'expo-file-system/legacy';

const ONBOARDING_FILE_PATH = `${(FileSystem as any).documentDirectory || ''}photocell_onboarding.json`;

/**
 * Whether the first-run onboarding has been completed.
 *
 * If the file can't be read for any reason this reports `true`: showing the
 * onboarding again to someone who already finished it is a nuisance, whereas
 * never showing it to a new user just means they meet the permission prompts
 * in context instead.
 */
export async function isOnboardingCompleted(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(ONBOARDING_FILE_PATH);
    if (!info.exists) return false;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(ONBOARDING_FILE_PATH));
    return parsed?.completed === true;
  } catch {
    return true;
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      ONBOARDING_FILE_PATH,
      JSON.stringify({ completed: true, completedAt: Date.now() })
    );
  } catch (err) {
    console.warn('Could not save onboarding state:', err);
  }
}
