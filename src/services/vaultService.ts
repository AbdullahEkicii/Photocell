import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { formatByteSize } from './cacheCleaner';
import { deleteMediaAssets } from './mediaScanner';

export interface VaultItem {
  id: string;
  filename: string;
  uri: string;
  sizeBytes: number;
  formattedSize: string;
  createdAt: number;
}

const VAULT_DIR = `${(FileSystem as any).documentDirectory || ''}vault/`;
const VAULT_CONFIG_FILE = `${(FileSystem as any).documentDirectory || ''}photocell_vault_config.json`;

/**
 * The PIN is never stored in clear text: it is salted and hashed with SHA-256.
 * Wrong attempts are rate-limited with a growing lockout so a 4-digit code cannot
 * be guessed by pressing buttons all day.
 */
interface VaultConfig {
  /** Version 2 stores a salted hash. Version 1 (plain `pin`) is migrated on first unlock. */
  version?: number;
  salt?: string;
  hash?: string;
  pin?: string; // legacy v1 only
  createdAt: number;
  failCount?: number;
  lockedUntil?: number;
  biometricEnabled?: boolean;
}

const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 30 * 60 * 1000;

/**
 * Ensure vault directory exists
 */
async function ensureVaultDirExists(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(VAULT_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('Could not make vault dir:', err);
  }
}

async function readConfig(): Promise<VaultConfig | null> {
  try {
    const info = await FileSystem.getInfoAsync(VAULT_CONFIG_FILE);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(VAULT_CONFIG_FILE)) as VaultConfig;
  } catch {
    return null;
  }
}

async function writeConfig(config: VaultConfig): Promise<boolean> {
  try {
    await ensureVaultDirExists();
    await FileSystem.writeAsStringAsync(VAULT_CONFIG_FILE, JSON.stringify(config));
    return true;
  } catch (err) {
    console.warn('Failed writing vault config:', err);
    return false;
  }
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function newSalt(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Check if a vault PIN has been set up */
export async function hasVaultPin(): Promise<boolean> {
  const config = await readConfig();
  return Boolean(config && (config.hash || (config.pin && config.pin.length === 4)));
}

export interface PinCheck {
  ok: boolean;
  /** Milliseconds left in a lockout; 0 when not locked. */
  lockedForMs: number;
}

/** Remaining lockout time, without counting as an attempt. */
export async function getVaultLockout(): Promise<number> {
  const config = await readConfig();
  return Math.max(0, (config?.lockedUntil ?? 0) - Date.now());
}

/**
 * Verify the entered PIN. Wrong guesses are counted; after FREE_ATTEMPTS the vault
 * locks for 30 s, doubling on each further miss up to 30 min.
 */
export async function verifyVaultPin(enteredPin: string): Promise<PinCheck> {
  const config = await readConfig();
  if (!config) return { ok: false, lockedForMs: 0 };

  const remaining = Math.max(0, (config.lockedUntil ?? 0) - Date.now());
  if (remaining > 0) return { ok: false, lockedForMs: remaining };

  // Legacy v1 config: compare, then rewrite as a salted hash on success.
  if (!config.hash && config.pin) {
    if (config.pin !== enteredPin) return registerFailure(config);
    await setVaultPin(enteredPin);
    return { ok: true, lockedForMs: 0 };
  }

  if (!config.salt || !config.hash) return { ok: false, lockedForMs: 0 };
  const candidate = await hashPin(enteredPin, config.salt);
  if (candidate !== config.hash) return registerFailure(config);

  if (config.failCount || config.lockedUntil) {
    await writeConfig({ ...config, failCount: 0, lockedUntil: 0 });
  }
  return { ok: true, lockedForMs: 0 };
}

async function registerFailure(config: VaultConfig): Promise<PinCheck> {
  const failCount = (config.failCount ?? 0) + 1;
  let lockedUntil = 0;
  let lockedForMs = 0;
  if (failCount >= FREE_ATTEMPTS) {
    const step = failCount - FREE_ATTEMPTS;
    lockedForMs = Math.min(BASE_LOCK_MS * 2 ** step, MAX_LOCK_MS);
    lockedUntil = Date.now() + lockedForMs;
  }
  await writeConfig({ ...config, failCount, lockedUntil });
  return { ok: false, lockedForMs };
}

/** Create or replace the vault PIN (also clears any lockout). */
export async function setVaultPin(newPin: string): Promise<boolean> {
  const salt = newSalt();
  const hash = await hashPin(newPin, salt);
  const previous = await readConfig();
  return writeConfig({
    version: 2,
    salt,
    hash,
    createdAt: previous?.createdAt ?? Date.now(),
    failCount: 0,
    lockedUntil: 0,
    biometricEnabled: previous?.biometricEnabled ?? false,
  });
}

/** Change the PIN after the old one has been verified. */
export async function changeVaultPin(oldPin: string, newPin: string): Promise<PinCheck & { saved?: boolean }> {
  const check = await verifyVaultPin(oldPin);
  if (!check.ok) return check;
  return { ok: true, lockedForMs: 0, saved: await setVaultPin(newPin) };
}

/** Whether the device has any screen lock (PIN, pattern, fingerprint or face). */
export async function hasDeviceLock(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Whether this device can use fingerprint / face unlock for the vault. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return Boolean((await readConfig())?.biometricEnabled);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  const config = await readConfig();
  if (config) await writeConfig({ ...config, biometricEnabled: enabled });
}

/**
 * Ask the device to confirm the owner (fingerprint, face, or the screen lock PIN).
 * Used both for biometric unlock and for resetting a forgotten vault PIN.
 */
export async function authenticateWithDevice(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: undefined,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Fetch all items securely stored in the private vault
 */
export async function getVaultItems(): Promise<VaultItem[]> {
  try {
    await ensureVaultDirExists();
    const files = await FileSystem.readDirectoryAsync(VAULT_DIR);
    const items: VaultItem[] = [];

    for (const filename of files) {
      const fileUri = `${VAULT_DIR}${filename}`;
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
        const modificationTime = 'modificationTime' in info && typeof info.modificationTime === 'number'
          ? info.modificationTime * 1000
          : Date.now();

        items.push({
          id: filename,
          filename,
          uri: fileUri,
          sizeBytes: size,
          formattedSize: formatByteSize(size),
          createdAt: modificationTime,
        });
      }
    }

    // Sort newest first
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  } catch (err) {
    console.error('Failed reading vault items:', err);
    return [];
  }
}

/**
 * Lock photo into vault (copies to private app storage)
 */
export async function lockPhotoToVault(sourceUri: string, originalAssetId?: string): Promise<boolean> {
  try {
    await ensureVaultDirExists();
    const filename = `vault_${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
    const targetUri = `${VAULT_DIR}${filename}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    // Optionally delete from public gallery if assetId provided
    if (originalAssetId) {
      try {
        await deleteMediaAssets([originalAssetId]);
      } catch {}
    }

    return true;
  } catch (err) {
    console.error('Failed locking photo to vault:', err);
    return false;
  }
}

/**
 * Restore photo from vault back to device public gallery
 */
export async function restorePhotoFromVault(item: VaultItem): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') return false;

    // Create asset in media library
    await MediaLibrary.createAssetAsync(item.uri);

    // Delete from vault
    await FileSystem.deleteAsync(item.uri, { idempotent: true });
    return true;
  } catch (err) {
    console.error('Failed restoring photo from vault:', err);
    return false;
  }
}

/**
 * Permanently delete photo from private vault
 */
export async function deleteVaultItem(item: VaultItem): Promise<boolean> {
  try {
    await FileSystem.deleteAsync(item.uri, { idempotent: true });
    return true;
  } catch (err) {
    console.error('Failed deleting vault item:', err);
    return false;
  }
}
