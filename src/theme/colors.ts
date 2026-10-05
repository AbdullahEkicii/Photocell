/**
 * Photocell design tokens — "Porcelain Glass".
 *
 * A light, calm surface set with a violet primary and emerald/rose/amber
 * semantics. Screens should only ever reference tokens from this file so the
 * palette stays coherent; raw rgba() literals in screen files are a bug.
 */

// --- Raw accent ramps (only used to build the tokens below) ---
const violet = {
  500: '#9333EA',
  400: '#A855F7',
  300: '#C084FC',
  600: '#7E22CE',
};
const magenta = { 500: '#D946EF' };
const emerald = { 500: '#10B981', 400: '#34D399' };
const rose = { 500: '#F43F5E', 400: '#FB7185' };
const amber = { 500: '#F59E0B' };
const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  500: '#64748B',
  600: '#475569',
  900: '#0F172A',
};

/**
 * Builds an 8-digit hex from a 6-digit hex plus an 0..1 alpha.
 * Keeps tinted fills/borders consistent instead of hand-written rgba strings.
 */
export const alpha = (hex: string, a: number): string => {
  const clamped = Math.max(0, Math.min(1, a));
  const suffix = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${suffix}`;
};

export const colors = {
  // --- Surfaces ---
  /** App canvas behind the atmospheric background. */
  canvas: slate[50],
  surface: '#FFFFFF',
  surfaceSunken: slate[100],
  surfaceCard: 'rgba(255, 255, 255, 0.85)',
  surfaceCardLight: 'rgba(248, 250, 252, 0.9)',
  /** Tinted fill for pressed / selected chips. */
  surfaceMuted: slate[100],

  // --- Borders ---
  border: slate[200],
  borderStrong: slate[300],
  whiteBorder: 'rgba(226, 232, 240, 0.85)',
  whiteBorderLight: 'rgba(241, 245, 249, 0.9)',
  whiteBorderSubtle: 'rgba(248, 250, 252, 0.9)',
  whiteGlass: 'rgba(255, 255, 255, 0.85)',
  whiteGlassHeavy: 'rgba(255, 255, 255, 0.95)',

  // --- Accents ---
  primary: violet[500],
  primaryLight: violet[400],
  primarySoft: violet[300],
  primaryDeep: violet[600],
  accent: magenta[500],
  successMint: emerald[500],
  successLight: emerald[400],
  dangerRose: rose[500],
  dangerLight: rose[400],
  warningAmber: amber[500],

  // --- Typography ---
  textPrimary: slate[900],
  textSecondary: slate[600],
  textMuted: slate[500],
  textOnAccent: '#FFFFFF',

  // --- Scrims (dark overlays over media / modals) ---
  scrim: 'rgba(15, 23, 42, 0.55)',
  scrimStrong: 'rgba(15, 23, 42, 0.78)',
  scrimMedia: 'rgba(0, 0, 0, 0.92)',

  // --- Gradients ---
  primaryGradient: [violet[500], violet[300]] as const,
  accentGradient: [magenta[500], violet[400]] as const,
  mintGradient: [emerald[500], emerald[400]] as const,
  roseGradient: [rose[500], '#BE123C'] as const,
  glassGradient: ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const,

  // --- Legacy aliases ---
  // The palette moved from a dark neon theme to porcelain/violet. These keep
  // older call sites compiling and all now resolve to the violet primary.
  oledBlack: slate[50],
  slateBase: slate[100],
  surfaceDark: '#FFFFFF',
  neonCyan: violet[500],
  neonBlue: violet[400],
  electricPurple: magenta[500],
  deepPurple: violet[600],
  cyanGradient: [violet[500], violet[300]] as const,
  purpleGradient: [magenta[500], violet[400]] as const,
  roseGradientLight: [rose[500], rose[400]] as const,
  glowCyan: alpha(violet[500], 0.18),
  glowPurple: alpha(magenta[500], 0.18),
  glowMint: alpha(emerald[500], 0.18),
  glowRose: alpha(rose[500], 0.18),
};

/** Shared elevation presets so cards/sheets cast the same shadow everywhere. */
export const elevation = {
  card: {
    shadowColor: slate[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  raised: {
    shadowColor: slate[900],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

/** Corner radii used across cards, chips and sheets. */
export const radius = {
  chip: 14,
  control: 20,
  card: 24,
  panel: 28,
  sheet: 32,
} as const;
