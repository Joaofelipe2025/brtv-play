// Instala o .ipk mais recente de dist-ipk/ numa TV LG em modo desenvolvedor e abre o app.
// Uso: pnpm webos:install [nome-da-tv]   (padrão: "tv", o nome dado em `pnpm webos:device`)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const device = process.argv[2] ?? 'tv';
const ipkDir = resolve(root, 'dist-ipk');

const ipks = existsSync(ipkDir)
  ? readdirSync(ipkDir)
      .filter((f) => f.endsWith('.ipk'))
      .map((f) => resolve(ipkDir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : [];
const ipk = ipks[0];
if (!ipk) {
  console.error('Nenhum .ipk em dist-ipk/. Rode `pnpm webos:package` primeiro.');
  process.exit(1);
}

const appId = JSON.parse(readFileSync(resolve(root, 'apps/webos/public/appinfo.json'), 'utf8')).id;
const isWindows = process.platform === 'win32';

/** Executa um binário do CLI do webOS instalado em apps/webos (devDependency). */
function ares(command, args) {
  const bin = resolve(root, 'apps/webos/node_modules/.bin', isWindows ? `${command}.cmd` : command);
  // No Windows, .cmd precisa de shell; os argumentos vão entre aspas por causa de espaços em caminhos
  const result = isWindows
    ? spawnSync(`"${bin}"`, args.map((a) => `"${a}"`), { stdio: 'inherit', shell: true })
    : spawnSync(bin, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n${command} falhou. A TV "${device}" está registrada (pnpm webos:device) e com o Developer Mode ativo?`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Instalando ${ipk.replace(root, '.')} na TV "${device}"…`);
ares('ares-install', ['--device', device, ipk]);
ares('ares-launch', ['--device', device, appId]);
