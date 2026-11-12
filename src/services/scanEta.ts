/**
 * Remaining-time estimate for the photo scan, based on how fast photos are actually
 * being processed. The scan reports cumulative progress after each batch; this turns
 * those reports into an assets-per-second rate (smoothed) and projects it forward.
 *
 * It returns null until there is a measured rate, so the UI never shows a made-up number.
 */
export class ScanEta {
  private lastAt = 0;
  private lastScanned = 0;
  /** Smoothed assets per millisecond. */
  private rate = 0;

  reset(): void {
    this.lastAt = 0;
    this.lastScanned = 0;
    this.rate = 0;
  }

  /**
   * Feeds one progress report and returns the projected remaining milliseconds,
   * or null when no estimate can be made yet.
   */
  update(scanned: number, total: number, now: number): number | null {
    if (this.lastAt === 0) {
      this.lastAt = now;
      this.lastScanned = scanned;
      return null;
    }

    const dt = now - this.lastAt;
    const dn = scanned - this.lastScanned;
    if (dt > 0 && dn > 0) {
      const instant = dn / dt;
      // Exponential smoothing: recent batches count more, but a single slow
      // batch doesn't make the countdown jump around.
      this.rate = this.rate === 0 ? instant : this.rate * 0.6 + instant * 0.4;
      this.lastAt = now;
      this.lastScanned = scanned;
    }

    if (this.rate <= 0) return null;
    const remainingAssets = total - scanned;
    if (remainingAssets <= 0) return null;
    return remainingAssets / this.rate;
  }
}
