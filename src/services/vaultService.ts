import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { formatByteSize } from './cacheCleaner';

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

interface VaultConfig {
  pin: string;
  createdAt: number;
}

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

/**
 * Check if a vault PIN has been set up
 */
export async function hasVaultPin(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(VAULT_CONFIG_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(VAULT_CONFIG_FILE);
      const parsed: VaultConfig = JSON.parse(content);
      return Boolean(parsed.pin && parsed.pin.length === 4);
    }
  } catch {}
  return false;
}

/**
 * Verify entered PIN against stored PIN
 */
export async function verifyVaultPin(enteredPin: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(VAULT_CONFIG_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(VAULT_CONFIG_FILE);
      const parsed: VaultConfig = JSON.parse(content);
      return parsed.pin === enteredPin;
    }
  } catch {}
  return false;
}

/**
 * Create or change the 4-digit vault PIN
 */
export async function setVaultPin(newPin: string): Promise<boolean> {
  try {
    await ensureVaultDirExists();
    const config: VaultConfig = {
      pin: newPin,
      createdAt: Date.now(),
    };
    await FileSystem.writeAsStringAsync(VAULT_CONFIG_FILE, JSON.stringify(config));
    return true;
  } catch (err) {
    console.warn('Failed setting vault pin:', err);
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
        await MediaLibrary.deleteAssetsAsync([originalAssetId]);
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
