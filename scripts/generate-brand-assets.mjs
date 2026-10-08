// Gera os ícones e o banner a partir de assets/brand/logo-dark.svg.
// Uso: pnpm brand:assets
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logo = readFileSync(resolve(root, 'assets/brand/logo-dark.svg'), 'utf8');
const BG = '#06080B';
const LOGO_RATIO = 250 / 478; // altura / largura do viewBox recortado

/** Coloca o logo centralizado numa tela de fundo escuro. */
function compose(width, height, logoWidth) {
  const logoHeight = logoWidth * LOGO_RATIO;
  const x = (width - logoWidth) / 2;
  const y = (height - logoHeight) / 2;
  const inner = logo.replace('<svg ', `<svg x="${x}" y="${y}" width="${logoWidth}" height="${logoHeight}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${BG}"/>${inner}</svg>`;
}

function render(svg, out) {
  const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`✓ ${out.replace(root, '.')}`);
}

const targets = [
  // webOS: appinfo.json icon (80x80) e largeIcon (130x130)
  { out: 'apps/webos/public/icon.png', w: 80, h: 80, logo: 70 },
  { out: 'apps/webos/public/largeIcon.png', w: 130, h: 130, logo: 114 },
  // Android TV: banner do launcher (320x180)
  { out: 'apps/android/assets/tv_banner.png', w: 320, h: 180, logo: 236 },
  // Android: ícone do app
  { out: 'apps/android/assets/icon.png', w: 1024, h: 1024, logo: 860 },
  // Prévia para revisão visual
  { out: 'assets/brand/logo-preview.png', w: 1200, h: 680, logo: 1000 },
];

for (const t of targets) {
  render(compose(t.w, t.h, t.logo), resolve(root, t.out));
}

// Logo como constante TypeScript, usada pelos dois apps (fonte única: o SVG acima)
const brandTs = `// Gerado por scripts/generate-brand-assets.mjs a partir de assets/brand/logo-dark.svg. Não editar.
/** Logo oficial para fundo escuro (SVG). Proporção largura/altura: 478/250. */
export const LOGO_DARK_SVG = ${JSON.stringify(logo.trim())};

export const LOGO_ASPECT_RATIO = 478 / 250;
`;
const brandOut = resolve(root, 'packages/core/src/brand.generated.ts');
writeFileSync(brandOut, brandTs);
console.log(`✓ ${brandOut.replace(root, '.')}`);
