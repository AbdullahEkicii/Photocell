import { Appearance } from 'react-native';

/**
 * Photocell design tokens — "Doğa" (nature).
 *
 * Two palettes, both drawn from the outdoors: forest green and sage for the brand,
 * warm sand and ochre for accents, sky blue for information, terracotta for
 * destructive actions. The light palette is a fresh, mineral white; the dark palette
 * is a night forest, not black and not purple.
 *
 * The palette follows the phone's light/dark setting. It is picked once when the app
 * starts (see `Appearance` below), because screens build their StyleSheets at import
 * time; switching the phone's theme takes effect the next time the app is opened.
 *
 * Screens only reference tokens from this file. Raw hex or rgba literals in screens
 * are a bug, with the exception of pure overlays (scrims) that work on both palettes.
 */

// --- Raw ramps, per palette ---

const lightRamp = {
  canvas: '#F3F7F1', // mineral white with a green breath
  surface: '#FFFFFF',
  surfaceSunken: '#E9F0E7',
  border: '#D5E0D2',
  borderStrong: '#B6C7B6',
  textPrimary: '#1B2A22', // deep forest ink
  textSecondary: '#44594C',
  textMuted: '#708577',
  primary: '#2E7D5B', // forest green
  primaryDeep: '#1F5C43',
  primarySoft: '#A9D6BC',
  accent: '#C98A3B', // warm ochre
  success: '#3B9A6B',
  danger: '#C2553E', // terracotta
  warning: '#D2A23E', // sand gold
  info: '#3F8BA3', // lake blue
};

const darkRamp: typeof lightRamp = {
  canvas: '#0E1812', // night forest floor
  surface: '#17241C',
  surfaceSunken: '#1C2D23',
  border: '#2A3E32',
  borderStrong: '#3C5646',
  textPrimary: '#E6F0E8',
  textSecondary: '#B4C8BA',
  textMuted: '#8AA091',
  primary: '#7FCBA2', // moss-lit green
  primaryDeep: '#A9E2C2',
  primarySoft: '#2C5C45',
  accent: '#E3A661', // lantern ochre
  success: '#6DC59B',
  danger: '#E38A73',
  warning: '#E6BE6C',
  info: '#7FBED1',
};

const isDark = Appearance.getColorScheme() === 'dark';
const ramp = isDark ? darkRamp : lightRamp;

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

export const isDarkTheme = isDark;

export const colors = {
  // --- Surfaces ---
  canvas: ramp.canvas,
  surface: ramp.surface,
  surfaceSunken: ramp.surfaceSunken,
  surfaceCard: alpha(ramp.surface, 0.9),
  surfaceCardLight: alpha(ramp.surfaceSunken, 0.9),
  /** Tinted fill for pressed / selected chips. */
  surfaceMuted: ramp.surfaceSunken,

  // --- Borders ---
  border: ramp.border,
  borderStrong: ramp.borderStrong,
  whiteBorder: alpha(ramp.border, 0.85),
  whiteBorderLight: alpha(ramp.border, 0.9),
  whiteBorderSubtle: alpha(ramp.border, 0.6),
  whiteGlass: alpha(ramp.surface, 0.85),
  whiteGlassHeavy: alpha(ramp.surface, 0.95),

  // --- Accents ---
  primary: ramp.primary,
  primaryLight: ramp.primary,
  primarySoft: ramp.primarySoft,
  primaryDeep: ramp.primaryDeep,
  accent: ramp.accent,
  successMint: ramp.success,
  successLight: ramp.success,
  dangerRose: ramp.danger,
  dangerLight: ramp.danger,
  warningAmber: ramp.warning,
  info: ramp.info,

  // --- Typography ---
  textPrimary: ramp.textPrimary,
  textSecondary: ramp.textSecondary,
  textMuted: ramp.textMuted,
  /** Text placed on a solid accent/primary fill: always the lightest colour. */
  textOnAccent: isDark ? '#0E1812' : '#FFFFFF',

  // --- Scrims (overlays over media / modals; work on both palettes) ---
  scrim: 'rgba(8, 20, 14, 0.5)',
  scrimStrong: 'rgba(8, 20, 14, 0.78)',
  scrimMedia: 'rgba(0, 0, 0, 0.92)',

  // --- Gradients ---
  primaryGradient: [ramp.primary, ramp.primarySoft] as const,
  accentGradient: [ramp.accent, ramp.warning] as const,
  mintGradient: [ramp.success, ramp.primary] as const,
  roseGradient: [ramp.danger, ramp.accent] as const,
  glassGradient: [alpha(ramp.surface, 0.95), alpha(ramp.surface, 0.75)] as const,

  // --- Legacy aliases (older call sites; all resolve to the nature palette) ---
  oledBlack: ramp.canvas,
  slateBase: ramp.surfaceSunken,
  surfaceDark: ramp.surface,
  neonCyan: ramp.primary,
  neonBlue: ramp.info,
  electricPurple: ramp.accent,
  deepPurple: ramp.primaryDeep,
  cyanGradient: [ramp.primary, ramp.primarySoft] as const,
  purpleGradient: [ramp.accent, ramp.warning] as const,
  roseGradientLight: [ramp.danger, ramp.accent] as const,
  glowCyan: alpha(ramp.primary, 0.18),
  glowPurple: alpha(ramp.accent, 0.18),
  glowMint: alpha(ramp.success, 0.18),
  glowRose: alpha(ramp.danger, 0.18),
};

/**
 * Liquid-glass tokens (Apple HIG: Materials > Liquid Glass).
 *
 * Glass belongs to the functional layer only: tab bar, header, floating controls and
 * sheets. Content and cards use opaque standard surfaces (`colors.surface`). The one
 * number Apple publishes is the 35% dark dimming layer behind clear glass over bright
 * media; every other value is a practical starting point.
 */
export const glass = isDark
  ? {
      regularFill: 'rgba(23, 36, 28, 0.6)',
      regularBlur: 70,
      frostedFill: 'rgba(23, 36, 28, 0.86)',
      clearFill: 'rgba(230, 240, 232, 0.12)',
      clearBlur: 28,
      dim: 'rgba(8, 20, 14, 0.35)',
      rim: 'rgba(180, 200, 186, 0.28)',
      rimClear: 'rgba(180, 200, 186, 0.22)',
      highlightTop: 'rgba(230, 240, 232, 0.10)',
      fallbackFill: '#17241C',
      edgeSolid: 'rgba(14, 24, 18, 0.92)',
      edgeClear: 'rgba(14, 24, 18, 0)',
      onClear: '#E6F0E8',
    }
  : {
      regularFill: 'rgba(255, 255, 255, 0.62)',
      regularBlur: 70,
      frostedFill: 'rgba(255, 255, 255, 0.86)',
      clearFill: 'rgba(255, 255, 255, 0.16)',
      clearBlur: 28,
      dim: 'rgba(8, 20, 14, 0.35)',
      rim: 'rgba(255, 255, 255, 0.78)',
      rimClear: 'rgba(255, 255, 255, 0.42)',
      highlightTop: 'rgba(255, 255, 255, 0.55)',
      fallbackFill: '#FFFFFF',
      edgeSolid: 'rgba(243, 247, 241, 0.92)',
      edgeClear: 'rgba(243, 247, 241, 0)',
      onClear: '#FFFFFF',
    };

/** Shared elevation presets so cards/sheets cast the same shadow everywhere. */
export const elevation = {
  card: {
    shadowColor: '#1B2A22',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.3 : 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  raised: {
    shadowColor: '#1B2A22',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.4 : 0.12,
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
  pill: 999,
} as const;
