# BRTV PLAY

Reprodutor de IPTV para **LG webOS** e **Android TV** (também roda em celular e tablet Android).

> O BRTV PLAY é apenas um reprodutor. Não fornece nenhum conteúdo. O usuário é responsável pelas listas que adiciona.

A pessoa cadastra a lista (M3U ou conta Xtream Codes) num portal web, vinculada ao MAC e à chave que o aparelho mostra na tela de ativação. O app só reproduz o que foi cadastrado.

## Estrutura

```
brtv-play/
├── packages/core/        Lógica compartilhada em TypeScript, sem UI, com testes (Vitest)
│   └── src/              device, backend (mock), M3U/Xtream/EPG, biblioteca, reprodução,
│                         controle parental, store, teclas do controle, tema, formatação
├── apps/webos/           LG webOS: React + Vite + hls.js/mpegts.js
├── apps/android/         Android TV e celular: Expo + react-native-tvos + react-native-video
├── assets/brand/         Logo oficial (fonte e versão otimizada)
├── scripts/              Geração de ícones/banners e instalação na TV
├── docs/
│   ├── PUBLICACAO.md     Como publicar na LG Content Store e na Google Play
│   └── superpowers/      Specs de design e planos de implementação
└── .github/              CI (GitHub Actions) e modelo de Pull Request
```

Regra da casa: o que não é tela vai para `packages/core`, com teste. Os dois apps só consomem.

## Começando

Pré-requisitos: **Node 22** (veja `.nvmrc`) e **pnpm 11**.

```bash
pnpm install
pnpm check
```

`pnpm check` roda lint, typecheck dos três pacotes, testes e o build do webOS. É o mesmo que o CI roda em todo Pull Request.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm check` | Lint, typecheck, testes e build do webOS |
| `pnpm lint` / `pnpm lint:fix` | ESLint (sem `any`, regras de hooks do React) |
| `pnpm typecheck` | `tsc --noEmit` no core, no webOS e no Android |
| `pnpm test` | Testes do core (Vitest) |
| `pnpm webos:dev` | webOS no navegador, com recarga automática |
| `pnpm webos:build` | Build de produção do webOS em `apps/webos/dist` |
| `pnpm webos:package` | Build + `.ipk` em `dist-ipk/` |
| `pnpm webos:device` | Registra uma TV LG em modo desenvolvedor |
| `pnpm webos:install [tv]` | Instala o `.ipk` mais recente na TV e abre o app |
| `pnpm android` | Build de desenvolvimento e execução no emulador/aparelho Android |
| `pnpm android:start` | Só o servidor do Metro (com um dev build já instalado) |
| `pnpm android:apk` | APK para instalar direto (EAS Build, na nuvem) |
| `pnpm android:store` | AAB para a Google Play (EAS Build, na nuvem) |
| `pnpm android:serve` | Serve o último APK na rede local para instalar no projetor/TV |
| `pnpm android:update` | Publica uma atualização automática (EAS Update) para os aparelhos |
| `pnpm brand:assets` | Regera ícones, banner e o logo usado pelos apps |

## LG webOS

Versão mínima: **webOS 5** (Chromium 68). O CSS evita recursos mais novos (`gap` em flex, `aspect-ratio`, `inset`) e o build compila para `chrome68`.

### No navegador

```bash
pnpm webos:dev
```

Abra a URL que o Vite mostrar e deixe a janela em 1920x1080. O controle é simulado pelo teclado (tabela abaixo).

### Numa TV LG (modo desenvolvedor)

1. Na TV, instale o app **Developer Mode** pela LG Content Store, entre com sua conta LG Developer e ative o modo. Anote o IP e a passphrase.
2. Registre a TV (nome sugerido: `tv`; porta 9922; usuário `prisoner`):

   ```bash
   pnpm webos:device
   ```

3. Gere o pacote e instale:

   ```bash
   pnpm webos:package
   pnpm webos:install tv
   ```

O CLI do webOS (`@webos-tools/cli`) vem como dependência do projeto; não precisa instalar nada global. O CI também publica o `.ipk` de cada execução como artefato (aba **Actions** → execução → `brtv-play-webos-ipk`).

## Android TV

Pré-requisitos extras: **JDK 17**, **Android Studio** com Android SDK e uma AVD de **Android TV** (Device Manager → Create virtual device → categoria TV → imagem com Google APIs).

```bash
pnpm android
```

O comando gera um *dev build* (`expo run:android`). O Expo Go não serve, porque `react-native-tvos` e `react-native-video` são módulos nativos.

- `react-native` aponta para `react-native-tvos@0.76.6-0`.
- O plugin `apps/android/plugins/withLeanback.js` ajusta o manifesto: leanback, toque e faketouch como **não obrigatórios** (o app aparece para TVs na Play Store), banner da TV e intent `LEANBACK_LAUNCHER`. O banner é copiado de `apps/android/assets/tv_banner.png`.

## Controles

| Ação | Android TV | LG webOS | Teclado (navegador) |
|---|---|---|---|
| Mover foco | D-pad | Setas | Setas |
| OK | Centro do D-pad | OK | Enter |
| Voltar (no player: 1º esconde o painel, 2º sai) | Voltar | Voltar | Esc |
| Trocar canal (ao vivo) | Cima/baixo, CH+/CH- | Cima/baixo, CH+/CH- | Cima/baixo, Page Up/Down |
| Ir ao canal N | Números | Números | Números |
| Pausar/continuar | Play/Pause | Play, Pause | OK em "Pausar" |
| Voltar/avançar 10 s (filmes) | Esquerda/direita, ⏪/⏩ | Esquerda/direita, ⏪/⏩ | Esquerda/direita |

## Player

Regras iguais nas duas plataformas, definidas no core (`packages/core/src/playback.ts`):

- **Reconexão:** até 3 tentativas, com espera de 1 s, 2 s e 4 s. Depois disso aparece "Tentar de novo".
- **Travamento:** se o vídeo fica 12 s parado sem estar pausado, conta como falha e entra na reconexão.
- **Canal por número:** até 4 dígitos; a troca acontece 1,5 s depois do último.

No webOS, Configurações → "Motor de vídeo" escolhe entre o player nativo da TV, o hls.js ou o automático (nativo na TV LG, hls.js no navegador).

## Controle parental

O PIN de 4 dígitos é definido em Configurações, junto com as categorias bloqueadas. Uma categoria bloqueada não aparece na Início, nos Favoritos, na troca de canal nem na busca, e abri-la pede o PIN (`packages/core/src/parental.ts`). O desbloqueio vale até o app ser fechado.

O PIN fica só no aparelho. Ele protege contra uso casual, não é uma barreira de segurança.

## Backend

Toda comunicação com o servidor passa pela interface `BackendService` (`packages/core/src/api.ts`).

- Hoje o app usa `MockBackendService`: teste grátis de 7 dias e uma lista de demonstração com streams públicos de teste da Mux (ao vivo, filmes e uma série).
- Para ligar o backend real (Supabase), implemente `getDeviceStatus(mac, key)` e troque a instância em um único lugar por app:
  - Android: `apps/android/src/backend.ts`
  - webOS: `apps/webos/src/library.ts` (`export const backend`)

Nenhuma URL de conteúdo real ou comercial está no código.

## Marca

O logo oficial fica em `assets/brand/` (`source/` tem o original exportado do Illustrator; `logo-dark.svg` é a versão otimizada). Depois de trocar o logo:

```bash
pnpm brand:assets
```

O script gera os ícones do webOS (80x80 e 130x130), o banner do Android TV (320x180), o ícone do Android e `packages/core/src/brand.generated.ts`, usado pelos dois apps.

## Qualidade

- **CI** (`.github/workflows/ci.yml`): em todo push na `main` e em todo Pull Request roda lint, typecheck, testes e gera o `.ipk`.
- **Testes:** M3U e classificação ao vivo/filmes/séries, Xtream, EPG em streaming, biblioteca, reprodução (reconexão, travamento, canal por número), teclas do controle, controle parental, store, device e formatação.
- **Padrões:** TypeScript estrito, sem `any`, finais de linha LF (`.gitattributes`, `.editorconfig`).

## Documentação

- [Guia de publicação](docs/PUBLICACAO.md): LG Content Store, Google Play e pontos de atenção para players de IPTV.
- [Instalar no projetor ou TV Android sem a Play Store](docs/INSTALAR-NO-PROJETOR.md): APK gerado na nuvem pela Expo.
- [Spec de design](docs/superpowers/specs/2026-10-08-brtv-play-design.md)
- Planos de implementação: [player](docs/superpowers/plans/2026-10-08-player.md), [paridade do Android](docs/superpowers/plans/2026-10-09-android-paridade.md)

## Listas próprias

Enquanto o backend não existe, a pessoa cadastra a própria lista direto no aparelho, em Configurações → Minhas listas → Adicionar lista:

- **Xtream Codes:** servidor, usuário e senha.
- **Link M3U:** uma URL (um link `get.php` do Xtream é reconhecido e tratado como Xtream). Fontes públicas e legítimas para teste, só canais abertos/gratuitos: `https://iptv-org.github.io/iptv/countries/br.m3u` e `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`.

A lista fica salva **só no aparelho** (`packages/core/src/userPlaylists.ts`), nunca no código nem em serviços externos. Servidores Xtream por `http://` exigem o APK com cleartext habilitado (já configurado em `apps/android/app.json`).

## Instalar no projetor / TV Android

Sem Android SDK local, o APK é gerado na nuvem (EAS Build) e instalado sem loja. Ver [docs/INSTALAR-NO-PROJETOR.md](docs/INSTALAR-NO-PROJETOR.md). Depois do primeiro APK, novas versões de código e conteúdo chegam por **atualização automática** (`pnpm android:update`), sem reinstalar — só mudanças nativas pedem um APK novo.

## Limitações conhecidas

- **Android TV validado em projetor, não em emulador/TV LG.** Rodou num projetor Android; falta validar num emulador e numa TV LG física.
- **Troca de áudio:** funciona com hls.js e no Android. No HLS nativo do webOS e no MPEG-TS, só as legendas são trocáveis.
- **EPG:** acima de 60 MB, o guia é ignorado quando o servidor não permite leitura em streaming. A conta usa o tamanho comprimido.
- **Backend:** ainda é o mock. O portal de ativação (`https://brtvplay.app/ativar`) é um placeholder; por enquanto, listas são cadastradas no próprio aparelho.
- **Adicionar lista** existe no Android; a mesma tela no webOS está planejada ([docs/superpowers/plans/2026-10-10-listas-do-usuario.md](docs/superpowers/plans/2026-10-10-listas-do-usuario.md), Task 2).
