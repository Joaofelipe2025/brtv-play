// Disponibiliza o APK na rede local para instalar no projetor/TV sem cabo nem pendrive.
// Uso: pnpm android:serve           (usa o APK em dist-apk/ ou baixa o último build do EAS)
//      pnpm android:serve --fetch   (baixa de novo o último build concluído)
// No aparelho (mesma rede Wi-Fi): abra http://<ip-do-computador>:8080 no app Downloader ou no navegador.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist-apk');
const apkPath = resolve(outDir, 'brtv-play.apk');
const PORT = 8080;

/** URL do APK do último build Android concluído no EAS. */
function latestBuildUrl() {
  const result = spawnSync(
    'npx eas-cli@latest build:list --platform android --status finished --limit 1 --json --non-interactive',
    { cwd: resolve(root, 'apps/android'), encoding: 'utf8', shell: true },
  );
  try {
    const [build] = JSON.parse(result.stdout);
    return build?.artifacts?.buildUrl ?? null;
  } catch {
    return null;
  }
}

async function ensureApk() {
  if (existsSync(apkPath) && !process.argv.includes('--fetch')) return;
  console.log('Procurando o último build Android concluído no EAS…');
  const url = latestBuildUrl();
  if (!url) {
    console.error('Nenhum build concluído encontrado. Rode `pnpm android:apk` e espere terminar.');
    process.exit(1);
  }
  console.log(`Baixando ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Falha ao baixar o APK (HTTP ${response.status}).`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(apkPath, Buffer.from(await response.arrayBuffer()));
}

/** IPs da rede local (Wi-Fi/cabo), ignorando loopback e endereços públicos de VPN. */
function lanAddresses() {
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && isPrivate(i.address))
    .map((i) => i.address);
}

await ensureApk();
const sizeMb = (statSync(apkPath).size / 1024 / 1024).toFixed(1);

createServer((req, res) => {
  // Qualquer caminho entrega o APK: basta digitar o IP e a porta no aparelho
  console.log(`${new Date().toLocaleTimeString('pt-BR')}  download pedido por ${req.socket.remoteAddress}`);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="brtv-play.apk"',
    'Content-Length': statSync(apkPath).size,
  });
  createReadStream(apkPath).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nAPK pronto (${sizeMb} MB). No projetor, na mesma rede Wi-Fi, abra:`);
  for (const ip of lanAddresses()) console.log(`  http://${ip}:${PORT}`);
  console.log('\nSe o Windows perguntar, permita o Node.js em redes privadas. Ctrl+C para parar.');
});
