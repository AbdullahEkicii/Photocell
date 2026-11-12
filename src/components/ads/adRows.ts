/**
 * Puts a banner row between the content of a long list.
 *
 * The first banner appears after `firstAt` items so it is visible without scrolling
 * far, then one every `every` items. Banners are never the first or last row, so a
 * list that is short enough shows none.
 */
export type AdRow<T> =
  | { kind: 'item'; key: string; item: T }
  | { kind: 'ad'; key: string; placement: string };

export function withAdRows<T>(
  items: T[],
  keyOf: (item: T) => string,
  placement: string,
  every = 6,
  firstAt = 4
): AdRow<T>[] {
  const rows: AdRow<T>[] = [];
  items.forEach((item, index) => {
    rows.push({ kind: 'item', key: keyOf(item), item });
    const position = index + 1;
    const isAdSpot = position >= firstAt && (position - firstAt) % every === 0;
    if (isAdSpot && position < items.length) {
      rows.push({ kind: 'ad', key: `ad-${placement}-${position}`, placement });
    }
  });
  return rows;
}
