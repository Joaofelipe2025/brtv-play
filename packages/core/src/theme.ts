/**
 * Tokens de cor e tipografia, derivados do logo oficial (assets/brand/logo-dark.svg).
 * Espelhados em cada app: CSS variables no webOS e objeto de tema no Android.
 */
export const colors = {
  background: '#06080B',
  surface: '#121820',
  surfaceElevated: '#1D2633',
  textPrimary: '#F4F7F2',
  textSecondary: '#97A3AE',
  /** Branco do "play" do logo: frente do foco */
  white: '#FEFEFE',
  /** Lima do logo: acento principal */
  accent: '#ACF602',
  /** Verde do logo */
  accentGreen: '#15E24D',
  /** Verde profundo do rastro do play */
  accentDeep: '#01B260',
  /** Amarelo do início do gradiente */
  accentYellow: '#F6F609',
  danger: '#FF5A4E',
} as const;

/** Gradiente da marca (do verde profundo ao amarelo), como no "br" do logo. */
export const brandGradient = ['#049F64', '#03D653', '#9AF70B', '#F6F609'] as const;

export const typography = {
  /** Mínimo de 24px na TV para leitura a 3 metros. */
  minTv: 24,
  body: 28,
  title: 40,
  hero: 64,
} as const;
