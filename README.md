# BRTV PLAY

Reprodutor de IPTV para Android / Android TV e LG webOS.

> O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que adiciona.

## Estrutura

```
brtv-play/
  packages/core/   lógica compartilhada em TypeScript (device, M3U, Xtream, EPG, store, tokens)
  apps/android/    Expo + react-native-tvos (celular, tablet e Android TV)
  apps/webos/      React + Vite + hls.js (LG webOS)
  docs/            specs de design
```

Pré-requisitos: Node 18+ e pnpm 11.

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Android / Android TV

Pré-requisitos extras: JDK 17, Android Studio com Android SDK, e uma AVD de **Android TV** (imagem Google TV ou Android TV).

1. Criar a AVD: Android Studio → Device Manager → Create virtual device → categoria **TV** → imagem com Google APIs.
2. Iniciar a AVD.
3. Na raiz do repositório:

```bash
pnpm android
```

O comando executa `expo run:android` (gera um dev build; o Expo Go não serve, porque `react-native-tvos` e `react-native-video` são módulos nativos).

Pontos de atenção:
- O manifest é ajustado pelo plugin `apps/android/plugins/withLeanback.js`: leanback como **não obrigatório**, banner da TV e intent `LEANBACK_LAUNCHER`.
- O banner da TV (`apps/android/assets/tv_banner.png`) é copiado para `res/drawable` pelo mesmo plugin durante o prebuild.
- O `react-native` está apontado para `react-native-tvos@0.76.6-0` (ver `apps/android/package.json`).

## Marca

O logo oficial fica em `assets/brand/logo-dark.svg` (versão otimizada, `viewBox` recortado). Depois de trocar o logo, rode:

```bash
pnpm brand:assets
```

O script gera os ícones do webOS (`icon.png` 80x80, `largeIcon.png` 130x130), o banner do Android TV (`tv_banner.png` 320x180), o ícone do Android e `packages/core/src/brand.generated.ts`, que os dois apps usam para desenhar o logo.

## LG webOS

Versão mínima: **webOS 5** (Chromium 68). O CSS evita recursos mais novos (`gap` em flex, `aspect-ratio`, `inset`) e o build compila para `chrome68`.

### Desenvolvimento no navegador

```bash
pnpm webos:dev
```

Abre em `http://127.0.0.1:5173`. Para simular o controle, use as setas do teclado, Enter (OK) e Escape (Voltar). Ajuste a janela do navegador para 1920x1080.

### Gerar o .ipk

Pré-requisito: CLI do webOS TV.

```bash
npm install -g @webos-tools/cli
pnpm webos:package
```

O `.ipk` é gerado em `dist-ipk/`.

Os ícones referenciados em `appinfo.json` já são gerados por `pnpm brand:assets`.

### Instalar numa TV LG (modo desenvolvedor)

1. Na TV, instale o app **Developer Mode** pela LG Content Store e faça login com sua conta LG Developer.
2. Ative o **Developer Mode** e anote o IP da TV e a chave (passphrase) exibidos no app.
3. No computador, registre a TV:

```bash
ares-setup-device
```

Siga as perguntas (nome, IP, porta 9922, usuário `prisoner`). Se pedir chave SSH, use a chave gerada pelo `ares-novacom` / `ares-setup-device` conforme o guia da LG.

4. Instale o pacote:

```bash
ares-install --device <nome-da-tv> dist-ipk/app.brtvplay.player_0.1.0_all.ipk
```

5. Abra o app:

```bash
ares-launch --device <nome-da-tv> app.brtvplay.player
```

## Backend

Toda comunicação com servidor passa por `BackendService`, definido em `packages/core/src/api.ts`.

- Nesta fase, o app usa `MockBackendService` (trial de 7 dias e uma playlist de demonstração com streams públicos de teste da Mux).
- Para ligar o backend real (Supabase), implemente a interface `BackendService` com `getDeviceStatus(mac, key)` e injete a instância:
  - Android: `apps/android/src/App.tsx` (`const backend = new MockBackendService()`).
  - webOS: `apps/webos/src/library.ts` (`export const backend`).

Nenhuma URL de conteúdo real ou comercial está no código.

## Controles

| Ação | Android TV | LG webOS | Navegador |
|---|---|---|---|
| Mover foco | D-pad | setas | setas |
| OK | DPad center | 13 | Enter |
| Voltar | Back | 461 | Escape |
| CH+ / CH- | cima / baixo (no player) | 427 / 428 | — |

## Testes

```bash
pnpm test
```

Cobrem o parser M3U, o cliente Xtream (fetch mockado), o EPG (leitura em chunks), a store (persistência, PIN, categorias bloqueadas), o device e o mock de backend.

## Limitações conhecidas

- Android: não compilado nesta sessão (JDK e Android SDK não estavam instalados). O código passa no `tsc`, mas o build nativo e o emulador ainda não foram validados.
- Android: Filmes e Séries ainda não têm tela, e a Início ainda não segue o layout com abas e destaque do webOS.
- webOS: a troca de áudio funciona com hls.js; no HLS nativo e no MPEG-TS só as legendas são trocáveis.
- webOS: `.ipk` ainda não gerado (`ares-package` não foi executado nesta máquina).
- Nenhuma validação em TV física.
