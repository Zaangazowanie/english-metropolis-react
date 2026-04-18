// English Metropolis — design tokens, ported verbatim from the
// Claude Design handoff (em/project/src/data.jsx). One source of truth
// for both reading modes + motion curves. Treat as inviolable.

export const TOKENS = {
  dark: {
    name: 'Midnight Library',
    bg:        '#0B1020',
    bgSoft:    '#10172B',
    panel:     '#171E37',
    panelSoft: '#1E2645',
    panelLift: '#252D4F',
    rule:      'rgba(201, 162, 75, 0.20)',
    ruleSoft:  'rgba(255, 255, 255, 0.07)',
    ruleHair:  'rgba(255, 255, 255, 0.04)',
    text:      '#F0E7D2',
    textSoft:  '#C9BFA8',
    textMute:  '#7A7360',
    textFade:  '#52503F',
    brand:     '#C9A24B', // brass
    brandSoft: '#E3C57A',
    brandDeep: '#8B6E2E',
    accent:    '#D96A3E', // ember
    accentSoft:'#E89372',
    teal:      '#6FB3A8',
    green:     '#8BB26F',
    red:       '#D96A3E',
    yellow:    '#E3C57A',
    chipBg:    'rgba(201, 162, 75, 0.10)',
    inputBg:   '#0F1528',
    backdrop:  'rgba(11, 16, 32, 0.85)',
  },
  light: {
    name: 'Daybreak Salon',
    bg:        '#F5EFE4',
    bgSoft:    '#FBF7EE',
    panel:     '#FFFFFF',
    panelSoft: '#FBF7EE',
    panelLift: '#F0E8D6',
    rule:      'rgba(28, 26, 22, 0.20)',
    ruleSoft:  'rgba(28, 26, 22, 0.10)',
    ruleHair:  'rgba(28, 26, 22, 0.06)',
    text:      '#1C1A16',
    textSoft:  '#4A463D',
    textMute:  '#8A8373',
    textFade:  '#B5AE9A',
    brand:     '#8F3B1B', // terracotta
    brandSoft: '#C76E48',
    brandDeep: '#5C2611',
    accent:    '#9A7A2E', // gold
    accentSoft:'#C4A150',
    teal:      '#3E5F3E',
    green:     '#3E5F3E',
    red:       '#9A2A20',
    yellow:    '#A3761F',
    chipBg:    'rgba(143, 59, 27, 0.08)',
    inputBg:   '#FBF7EE',
    backdrop:  'rgba(245, 239, 228, 0.85)',
  },
};

export const FONTS = {
  serif: '"Fraunces", "EB Garamond", Georgia, serif',
  body:  '"Source Serif 4", "Source Serif Pro", Georgia, serif',
  label: '"Geist", "Inter", -apple-system, sans-serif',
  mono:  '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
};

export const EASE = {
  springFast:   'cubic-bezier(0.32, 1.6, 0.5, 1)',
  springGentle: 'cubic-bezier(0.4, 1.2, 0.4, 1)',
  editorial:    'cubic-bezier(0.65, 0, 0.15, 1)',
};
