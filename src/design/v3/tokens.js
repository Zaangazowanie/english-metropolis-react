// English Metropolis v3 design tokens — ported from Claude Design handoff.
// Aesthetic: deep violet night, glossy glass, purple→fuchsia→pink, ember-orange accent.

export const FONT = {
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  body: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
}

export const G = {
  brand: 'linear-gradient(135deg, #8B5CF6 0%, #D946EF 55%, #F472B6 100%)',
  brandSoft: 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(217,70,239,0.25) 55%, rgba(244,114,182,0.25) 100%)',
  brandVert: 'linear-gradient(180deg, #A855F7 0%, #D946EF 55%, #F472B6 100%)',
  brandLine: 'linear-gradient(90deg, #8B5CF6 0%, #D946EF 50%, #F472B6 100%)',
  ember: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
  emerald: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
  sky: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
  amber: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
  rose: 'linear-gradient(135deg, #FB7185 0%, #E11D48 100%)',
  aurora:
    'radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(217,70,239,0.18), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(244,114,182,0.14), transparent 60%)',
  auroraDay:
    'radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 20%, rgba(217,70,239,0.08), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(244,114,182,0.08), transparent 60%)',
  glass: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
  glassHi: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 100%)',
  glassDay: 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.65) 100%)',
  sheen: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.00) 45%, rgba(0,0,0,0.12) 100%)',
}

export const NIGHT = {
  bg0: '#060410',
  bg1: '#0A0718',
  bg2: '#11092A',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHi: 'rgba(255,255,255,0.07)',
  surfaceLo: 'rgba(8, 4, 20, 0.55)',
  text: '#F4F0FF',
  textSoft: '#CEC8E8',
  textDim: '#8A83AE',
  textMute: '#5E567C',
  border: 'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.16)',
  borderSoft: 'rgba(255,255,255,0.05)',
  violet: '#A855F7',
  fuchsia: '#D946EF',
  pink: '#F472B6',
  brand: '#D946EF',
  brandInk: '#F0ABFC',
  ember: '#FB923C',
  emerald: '#34D399',
  sky: '#60A5FA',
  amber: '#FCD34D',
  rose: '#FB7185',
  good: '#34D399',
  warn: '#FCD34D',
  bad: '#FB7185',
  shadow: '0 30px 90px -30px rgba(139,92,246,0.35), 0 6px 20px -10px rgba(0,0,0,0.6)',
  shadowSm: '0 8px 24px -10px rgba(0,0,0,0.55)',
  ringBrand: '0 0 0 1px rgba(217,70,239,0.45), 0 0 40px -6px rgba(217,70,239,0.45)',
  pageBg:
    'radial-gradient(ellipse 100% 80% at 50% -10%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(ellipse 80% 60% at 80% 30%, rgba(217,70,239,0.10), transparent 60%), radial-gradient(ellipse 80% 60% at 10% 70%, rgba(99,102,241,0.10), transparent 60%), #060410',
}

export const DAY = {
  bg0: '#FBFAFF',
  bg1: '#FFFFFF',
  bg2: '#F5F2FC',
  surface: 'rgba(255,255,255,0.75)',
  surfaceHi: 'rgba(255,255,255,0.9)',
  surfaceLo: 'rgba(255,255,255,0.55)',
  text: '#0E0A1B',
  textSoft: '#2B2542',
  textDim: '#5F5780',
  textMute: '#8F87AC',
  border: 'rgba(16,10,40,0.08)',
  borderHi: 'rgba(16,10,40,0.16)',
  borderSoft: 'rgba(16,10,40,0.05)',
  violet: '#7C3AED',
  fuchsia: '#C026D3',
  pink: '#DB2777',
  brand: '#A21CAF',
  brandInk: '#86198F',
  ember: '#EA580C',
  emerald: '#059669',
  sky: '#2563EB',
  amber: '#D97706',
  rose: '#E11D48',
  good: '#059669',
  warn: '#D97706',
  bad: '#E11D48',
  shadow: '0 30px 80px -24px rgba(124,58,237,0.18), 0 8px 20px -10px rgba(0,0,0,0.08)',
  shadowSm: '0 6px 20px -8px rgba(0,0,0,0.10)',
  ringBrand: '0 0 0 1px rgba(162,28,175,0.25), 0 0 40px -8px rgba(217,70,239,0.30)',
  pageBg:
    'radial-gradient(ellipse 100% 80% at 50% -10%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(ellipse 80% 60% at 80% 30%, rgba(217,70,239,0.07), transparent 60%), radial-gradient(ellipse 80% 60% at 10% 70%, rgba(99,102,241,0.05), transparent 60%), #FBFAFF',
}

export const EASE = {
  springFast: 'cubic-bezier(0.16, 1, 0.3, 1)',
  springSoft: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  gentle: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  editorial: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  linear: 'linear',
}

export const CEFR_COLOR = {
  A1: '#60A5FA', A2: '#34D399',
  B1: '#FCD34D', B2: '#FB923C',
  C1: '#D946EF', C2: '#F472B6',
}

export const CAT_COLOR = {
  grammar: { grad: 'linear-gradient(135deg, #8B5CF6, #6366F1)', solid: '#8B5CF6' },
  vocabulary: { grad: 'linear-gradient(135deg, #D946EF, #A855F7)', solid: '#D946EF' },
  pronunciation: { grad: 'linear-gradient(135deg, #F472B6, #EC4899)', solid: '#F472B6' },
  fluency: { grad: 'linear-gradient(135deg, #FB923C, #F97316)', solid: '#FB923C' },
  communicative: { grad: 'linear-gradient(135deg, #34D399, #10B981)', solid: '#34D399' },
}

export function getTheme(mode) {
  return mode === 'day' ? DAY : NIGHT
}
