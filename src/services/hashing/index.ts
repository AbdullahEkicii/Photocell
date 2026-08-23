import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as jpeg from 'jpeg-js';
import { toByteArray as decodeBase64 } from 'base64-js';

export interface VisualFingerprint {
  dHash: string; // 64-bit binary string
  colorSignature: [number, number, number]; // Normalized R, G, B [0..255]
  aspectRatio: number;
}

/**
 * Calculates Hamming distance (number of bit differences) between two 64-bit binary strings
 */
export function computeHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist++;
  }
  return dist;
}

/**
 * Calculates Euclidean color distance between two RGB color signatures
 */
export function computeColorDistance(
  colA: [number, number, number],
  colB: [number, number, number]
): number {
  const dr = colA[0] - colB[0];
  const dg = colA[1] - colB[1];
  const db = colA[2] - colB[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Computes a memory-safe 64-bit Difference Hash (dHash) and color profile for an image.
 */
export async function computePerceptualFingerprint(
  uri: string
): Promise<VisualFingerprint | null> {
  let tempUri: string | null = null;
  try {
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 9, height: 8 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    tempUri = resized.uri;

    if (!resized.base64) return null;

    const bytes = decodeBase64(resized.base64);
    const decoded = jpeg.decode(bytes, { useTArray: true });
    const { width, height, data } = decoded;

    if (!data || width < 9 || height < 8) return null;

    // Convert to grayscale and compute channel averages
    const gray = new Float32Array(72);
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    const pixelCount = width * height;

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      totalR += r;
      totalG += g;
      totalB += b;
      if (i < 72) {
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    // Compute 64-bit difference hash (8 rows x 8 adjacent gradient comparisons)
    let hashBits = '';
    for (let row = 0; row < 8; row++) {
      const rowOffset = row * 9;
      for (let col = 0; col < 8; col++) {
        const left = gray[rowOffset + col];
        const right = gray[rowOffset + col + 1];
        hashBits += left > right ? '1' : '0';
      }
    }

    const colorSignature: [number, number, number] = [
      Math.round(totalR / pixelCount),
      Math.round(totalG / pixelCount),
      Math.round(totalB / pixelCount),
    ];

    return {
      dHash: hashBits,
      colorSignature,
      aspectRatio: width / Math.max(1, height),
    };
  } catch {
    return null;
  } finally {
    if (tempUri) {
      FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
  }
}
