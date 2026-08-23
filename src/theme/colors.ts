export const colors = {
  // Base Porcelain Light Surfaces
  oledBlack: '#F8FAFC',
  slateBase: '#F1F5F9',
  surfaceDark: '#FFFFFF',
  surfaceCard: 'rgba(255, 255, 255, 0.85)',
  surfaceCardLight: 'rgba(248, 250, 252, 0.9)',

  // Vivid Modern Non-Blue Accent Colors (Violet, Emerald, Sunset Rose, Amber)
  neonCyan: '#9333EA',      // Vivid Amethyst Violet (replacing blue/cyan)
  neonBlue: '#A855F7',      // Electric Purple
  electricPurple: '#D946EF',// Radiant Magenta
  deepPurple: '#7E22CE',
  successMint: '#10B981',   // Emerald Green
  dangerRose: '#F43F5E',    // Rose Red
  warningAmber: '#F59E0B',  // Warm Amber

  // Light Specular Glass Borders
  whiteBorder: 'rgba(226, 232, 240, 0.85)',
  whiteBorderLight: 'rgba(241, 245, 249, 0.9)',
  whiteBorderSubtle: 'rgba(248, 250, 252, 0.9)',
  whiteGlass: 'rgba(255, 255, 255, 0.85)',
  whiteGlassHeavy: 'rgba(255, 255, 255, 0.95)',

  // Soft Ambient Glows
  glowCyan: 'rgba(147, 51, 234, 0.18)',
  glowPurple: 'rgba(217, 70, 239, 0.18)',
  glowMint: 'rgba(16, 185, 129, 0.18)',
  glowRose: 'rgba(244, 63, 94, 0.18)',

  // Crisp High-Contrast Light Mode Typography
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',

  // Light Gradients
  cyanGradient: ['#9333EA', '#C084FC'] as const,
  purpleGradient: ['#D946EF', '#A855F7'] as const,
  mintGradient: ['#10B981', '#34D399'] as const,
  roseGradient: ['#F43F5E', '#FB7185'] as const,
  glassGradient: ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const,
};
