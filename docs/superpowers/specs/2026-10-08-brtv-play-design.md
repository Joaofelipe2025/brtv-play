# BRTV PLAY — Design (Fase 1: Frontend)

## 1. Objetivo
Player de IPTV genérico para Android/Android TV (Expo + react-native-tvos) e LG webOS (React + Vite + hls.js).
O app não fornece conteúdo: reproduz playlists cadastradas pelo próprio usuário, vinculadas a um ID de aparelho.
Nesta fase: somente frontend. Toda comunicação com servidor passa por `BackendService`, implementado como mock.

## 2. Estrutura do monorepo (pnpm workspaces)
```
brtv-play/
  packages/core/     TypeScript puro, sem UI, testado com Vitest
  apps/android/      Expo + react-native-tvos
  apps/webos/        React + Vite + hls.js
  docs/              specs e guias
```

## 3. packages/core
| Unidade | Responsabilidade | Dependências |
|---|---|---|
| `storage.ts` | Interface `KeyValueAdapter` (get/set/remove async) + `MemoryAdapter` para testes | — |
| `device.ts` | Gera e persiste ID tipo MAC (`3A:F1:9C:22:7B:E4`) + Device Key de 6 dígitos. Nunca lê MAC real | storage |
| `api.ts` | `BackendService` + `MockBackendService` (trial 7 dias, playlist demo com HLS público) | — |
| `m3u.ts` | Parser M3U/M3U8: tvg-id, tvg-name, tvg-logo, group-title, url | — |
| `xtream.ts` | Cliente Xtream Codes (`player_api.php`): auth, categorias, streams live/VOD/séries, info de série, URLs de stream | fetch injetável |
| `epg.ts` | Parser XMLTV em streaming, índice por tvg-id, consulta atual/próximo | — |
| `store.ts` | Zustand: favoritos, histórico, continuar assistindo (segundos), PIN parental de 4 dígitos | storage |
| `index.ts` | Reexporta a API pública | — |

Contratos principais:
- `DeviceStatus = { status: 'trial' | 'active' | 'expired'; expiresAt: string; playlists: Playlist[] }`
- `Playlist = { id; name; kind: 'm3u' | 'xtream'; channels?; ... }`
- `Channel = { id; name; url; tvgId?; tvgLogo?; group; }`
- `VodItem`, `Series`, `Episode` — campos mínimos para exibição.

## 4. Telas (ambas as plataformas, mesmos nomes e props de componentes)
1. Ativação: logo, MAC e Device Key grandes, URL placeholder `https://brtvplay.app/ativar`, QR code com MAC, status. Polling a cada 10s.
2. Seleção de playlist.
3. Home: TV ao Vivo, Filmes, Séries, Favoritos, Configurações.
4. TV ao Vivo: categorias | canais | preview + EPG atual/próximo.
5. Filmes/Séries: grid por categoria, busca, detalhes, temporadas/episódios.
6. Player fullscreen: overlay, EPG, progresso (VOD), áudio/legenda, CH+/CH-, voltar.
7. Configurações: MAC/Key, recarregar playlist, PIN parental, formato HLS/TS, limpar cache, Sobre (com aviso legal).

## 5. Navegação de TV
- Foco sempre visível (borda + scale leve). Foco nunca se perde: ao montar uma tela, o primeiro item focável recebe foco.
- Um único módulo `focus` controla a navegação em direções (cima/baixo/esquerda/direita), OK e Voltar.
- Android: teclas DPAD e KEYCODE_BACK via `react-native-tvos`.
- webOS: keyCodes LG: Back=461, setas (37/38/39/40), OK=13, cores (vermelho 403, verde 404, amarelo 405, azul 406).
- webOS: `appinfo.json` com resolução 1920x1080 e `disableBackHistoryAPI: true`.

## 6. Listas
- Android: FlashList.
- webOS: `@tanstack/react-virtual`.

## 7. Player
- Android: `react-native-video` (ExoPlayer/Media3), HLS e MPEG-TS, buffer configurável.
- webOS: `<video>` nativo quando HLS é suportado; fallback `hls.js`; `mpegts.js` para TS.
- Reconexão: 3 tentativas com backoff exponencial (1s, 2s, 4s).

## 8. Design visual (proposta, a validar com o usuário)
Tokens centralizados em `packages/core/src/theme.ts` (valores puros, sem UI) e espelhados nos dois apps.
- Fundo: `#0B0F14`; superfície: `#141A22`; superfície elevada: `#1D2530`
- Texto principal: `#F2F5F8`; secundário: `#9AA7B4`
- Destaque verde-amarelo: `#B8D433` (foco/ativo); verde de apoio: `#2E9E5B`; amarelo de apoio: `#F2C94C`
- Erro/expirado: `#E5534B`
- Tipografia: mínimo 24px na TV; títulos 40px; corpo 28px.

## 9. Erros
- Falha de rede no mock: retorna status `expired` com lista vazia; UI mostra aviso.
- Playlist M3U inválida: parser ignora entradas sem URL e retorna o que for válido.
- Stream cai: reconexão conforme seção 7; após 3 falhas, mostra erro com botão de tentar novamente.

## 10. Testes
- `packages/core`: Vitest para M3U, Xtream (fetch mockado), EPG (XML de amostra), store (persistência via MemoryAdapter), device (formato do ID).
- Apps: verificação manual no emulador Android TV e no navegador em 1920x1080.

## 11. Limitações conhecidas nesta sessão
- Android SDK/JDK e CLI webOS não estão instalados: o build Android e o `.ipk` não podem ser validados aqui até a instalação.
- Nenhuma URL de conteúdo real/comercial no código; apenas streams públicos de teste no mock.
