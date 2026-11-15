// DUSTLINE look plan, in one place. A dusk desert compound: warm sand and
// terracotta against deep slate, one accent hue for the Vanguard and one
// warning hue for the Jackals. The same names are the CSS custom properties
// in index.html.
export const PALETTE = {
  canvas: '#171209',
  surface: '#2b2118',
  hairline: '#54432c',
  ink: '#f2e8d5',
  muted: '#a3906f',
  accent: '#e07830',
  foe: '#c94f42',
  ally: '#4fae8d',
  sand: '#8a6f45',
  sandDark: '#6b5636',
  sky: '#241a12',
};

export function shade(name) {
  return PALETTE[name];
}
