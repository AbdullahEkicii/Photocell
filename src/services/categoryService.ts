import * as MediaLibrary from 'expo-media-library/legacy';

import { PhotoAsset } from './mediaScanner';

/**
 * Ready-made review sets the user can clean in one go. Each one is a real MediaLibrary
 * query (albums, a filename pattern or a date filter). Sizes are NOT measured up front:
 * measuring hundreds of files costs one native call each and froze the app. The review
 * screen measures a photo only at the moment it is deleted.
 */
export type CategoryId = 'whatsapp' | 'downloads' | 'old_photos';

const MAX_ITEMS = 400;
/** Metadata-only pass over the newest photos when looking for filename patterns. */
const MAX_FILENAME_SCAN = 6000;
const PAGE_SIZE = 200;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * WhatsApp saves media in several albums depending on the app version and variant
 * ("WhatsApp Images", "WhatsApp Business Images", "Sent", ...) and names files
 * IMG-YYYYMMDD-WA0001.jpg. Matching albums alone misses the sent folder and renamed
 * buckets, so the filename pattern is checked as well.
 */
const WHATSAPP_ALBUM = /whats\s?app/i;
const WHATSAPP_FILENAME = /(^|[^a-z])(IMG|PHOTO|VID)-\d{8}-WA\d+/i;

const DOWNLOAD_ALBUM = /^(download|downloads|indirilenler)$/i;

export interface CategoryResult {
  /** Empty when the device has nothing for this category. */
  assets: PhotoAsset[];
  /** Number of photos found (can exceed the returned set, which is capped). */
  total: number;
}

async function pagePhotos(
  options: { album?: MediaLibrary.Album; createdBefore?: number; limit: number },
  accept?: (asset: MediaLibrary.Asset) => boolean
): Promise<MediaLibrary.Asset[]> {
  const found: MediaLibrary.Asset[] = [];
  let scanned = 0;
  let after: string | undefined;
  let hasNextPage = true;
  while (hasNextPage && scanned < options.limit && (accept ? true : found.length < MAX_ITEMS)) {
    const page = await MediaLibrary.getAssetsAsync({
      album: options.album,
      mediaType: 'photo',
      first: PAGE_SIZE,
      after,
      createdBefore: options.createdBefore,
      sortBy: [['creationTime', false]],
    });
    for (const asset of page.assets) {
      if (!accept || accept(asset)) found.push(asset);
    }
    scanned += page.assets.length;
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }
  return found;
}

async function albumsMatching(pattern: RegExp): Promise<MediaLibrary.Album[]> {
  const albums = await MediaLibrary.getAlbumsAsync();
  return albums.filter((album) => pattern.test(album.title) && (album.assetCount ?? 0) > 0);
}

function dedupeNewestFirst(list: MediaLibrary.Asset[]): MediaLibrary.Asset[] {
  const byId = new Map<string, MediaLibrary.Asset>();
  for (const asset of list) byId.set(asset.id, asset);
  return Array.from(byId.values()).sort((a, b) => b.creationTime - a.creationTime);
}

async function loadWhatsApp(): Promise<MediaLibrary.Asset[]> {
  const albums = await albumsMatching(WHATSAPP_ALBUM);
  const fromAlbums: MediaLibrary.Asset[] = [];
  for (const album of albums) {
    fromAlbums.push(...(await pagePhotos({ album, limit: MAX_ITEMS })));
  }
  // Catches WhatsApp files that live in a differently named folder (e.g. "Sent").
  const fromFilename = await pagePhotos({ limit: MAX_FILENAME_SCAN }, (asset) =>
    WHATSAPP_FILENAME.test(asset.filename)
  );
  return dedupeNewestFirst([...fromAlbums, ...fromFilename]);
}

export async function loadCategory(id: CategoryId): Promise<CategoryResult> {
  let raw: MediaLibrary.Asset[] = [];

  if (id === 'whatsapp') {
    raw = await loadWhatsApp();
  } else if (id === 'downloads') {
    const albums = await albumsMatching(DOWNLOAD_ALBUM);
    const lists: MediaLibrary.Asset[] = [];
    for (const album of albums) lists.push(...(await pagePhotos({ album, limit: MAX_ITEMS })));
    raw = dedupeNewestFirst(lists);
  } else {
    raw = await pagePhotos({ createdBefore: Date.now() - TWO_YEARS_MS, limit: MAX_ITEMS });
  }

  return { assets: raw.slice(0, MAX_ITEMS) as PhotoAsset[], total: raw.length };
}
