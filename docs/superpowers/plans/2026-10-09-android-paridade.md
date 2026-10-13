# Plano — Paridade do Android TV com o webOS

Spec: `docs/superpowers/specs/2026-10-08-brtv-play-design.md` (seções 3, 4, 5, 6). Referência de comportamento e copy: o app webOS em `apps/webos/src/` (telas `screens/*.tsx`, `library.ts`, `format.ts`).

## Contexto

O webOS tem: Ativação, Escolha de lista, Início (abas no topo, destaque com vídeo ao vivo sem som, trilho "Seus canais"), TV ao Vivo (categorias | canais com logo e programa atual | prévia), Filmes e Séries (pílulas de categoria, busca, grade de pôsteres com arte gerada, destaque do item focado), detalhe de Série (temporadas e episódios), Configurações (aparelho, formato, lista, PIN, categorias bloqueadas) e Sobre.

O Android (`apps/android/src/`) tem só Ativação, uma Início simples, TV ao Vivo básica e o Player (`Player.tsx`, já completo — não reescrever). A lógica de biblioteca (M3U classificado, Xtream, EPG) está duplicada dentro do webOS e precisa ir para o core.

## Global Constraints

- TypeScript strict, sem `any`. Devem passar: `pnpm test` (raiz), `pnpm --filter @brtv/webos build`, `cd apps/android && npx tsc --noEmit`.
- Lógica sem UI compartilhada vai em `packages/core` com testes Vitest; os apps consomem.
- Copy em português do Brasil, frases em caixa normal, **idêntica à do webOS** para a mesma tela/estado.
- Android: texto mínimo 24; cores de `colors` do core; fonte Poppins via `Text`/`Title`/`Body` de `apps/android/src/ui.tsx`; foco com `FocusCard` (rastro lima/verde) para tudo que é focável.
- Android: navegação 100% por D-pad. Cada tela define o foco inicial com `autoFocus`/`hasTVPreferredFocus` no conteúdo principal (não nas abas). Voltar (BackHandler) desempilha telas; na Início, sai do app.
- Android: só um `<Video>` vivo por vez — a prévia da Início/TV ao Vivo desmonta antes do Player montar (renderizar só a tela do topo da pilha).
- Nenhuma URL de conteúdo real/comercial.
- Não alterar `apps/android/src/Player.tsx` além do necessário para integrar (props já existentes).

## Task 1: Biblioteca e formatação no core

Arquivos: criar `packages/core/src/library.ts`, `packages/core/src/format.ts`, `packages/core/test/library.test.ts`, `packages/core/test/format.test.ts`; alterar `packages/core/src/index.ts`, `apps/webos/src/library.ts`, `apps/webos/src/format.ts`, `apps/android/src/Player.tsx` (só trocar o `formatClock` local pelo do core).

1. Mover de `apps/webos/src/library.ts` para `packages/core/src/library.ts`: os tipos `LiveItem`, `VodItem`, `EpisodeItem`, `SeriesEntry`, `Library`, e as funções `cleanGroup`, `loadLibrary`, `loadSeasons`, `loadEpg`, sem mudar comportamento. Diferenças:
   - `loadLibrary(playlist, format, fetchFn?)` e `loadEpg(url, fetchFn?)` recebem um fetch injetável (padrão `globalThis.fetch`), para testes. O `XtreamClient` já aceita `FetchLike`.
   - `format` é `'hls' | 'ts'` (exportar `type StreamFormat = 'hls' | 'ts'` do core).
   - `loadEpg` lê `response.body` em streaming quando existir; se `body` não existir (React Native), cai para `await response.text()` e passa como um único chunk ao `parseXmltvStream`.
2. `apps/webos/src/library.ts` passa a reexportar do core e mantém só `backend` e `fetchStatus`. Nenhuma tela do webOS muda de import.
3. Mover `formatClock`, `formatHour`, `elapsed` de `apps/webos/src/format.ts` para `packages/core/src/format.ts`; o arquivo do webOS reexporta. No Android, `Player.tsx` usa o `formatClock` do core e remove a cópia local.
4. Testes Vitest (TDD): `cleanGroup('Filmes | Ação') === 'Ação'`; `loadLibrary` com M3U (`DEMO_M3U`) produz ao vivo/filmes/séries com ids `vod-…` e grupos limpos; `loadLibrary` com Xtream usando fetch falso (auth ok, categorias, streams) produz URLs `.m3u8` ou `.ts` conforme `format`, pôster/capa mapeados, `epgUrl` com usuário/senha codificados; `loadSeasons` (M3U devolve as temporadas já presentes; Xtream mapeia episódios com URL de episódio); `loadEpg(null)` → mapa vazio; `loadEpg` com resposta sem `body` usa `text()`; resposta `ok: false` → mapa vazio. `formatClock(754) === '12:34'`, `formatClock(3723) === '1:02:03'`, `elapsed` limita a 0..1.

## Task 2: Fundação de navegação do Android

Arquivos: criar `apps/android/src/navigation.tsx` (rotas, contexto, pilha), `apps/android/src/components/TopBar.tsx`, `apps/android/src/screens/Activation.tsx`, `apps/android/src/screens/Playlists.tsx`; alterar `apps/android/src/App.tsx`, `apps/android/src/platform.ts`, `apps/android/plugins/withLeanback.js`.

1. `navigation.tsx`: tipo `Route` igual ao do webOS (`apps/webos/src/context.ts`) — `activation | playlists | home | live{category?} | movies{category?} | series{category?} | seriesDetail{seriesId} | settings | about | player{url,title,isLive,id?,channels?,index?}`; `Session` igual ao webOS (`device, status, playlist, library, loading, epg, prefs: { streamFormat }, unlockedCategories, reloadToken`); contexto `useApp()` com `session, update, go, replace, reset, back`; constante `FAVORITES = '__favoritos__'`.
2. `App.tsx`: carrega fontes (como hoje), device, store (`hydrate`), preferências; mantém a pilha de rotas; carrega biblioteca + EPG com `loadLibrary`/`loadEpg` do core quando playlist/formato/reloadToken mudam (mesma lógica do `apps/webos/src/App.tsx`); renderiza **só a tela do topo**; BackHandler: se a rota do topo for `player`, retorna `false` (o Player trata o próprio Voltar); se houver mais de uma rota, desempilha e retorna `true`; senão retorna `false` (sai do app). A rota `player` renderiza o `Player` existente com `onExit={back}`, `onChannel`/`onChannelNumber` trocando a rota via `replace` (como hoje).
3. `platform.ts`: `loadPreferences()`/`savePreferences()` com `{ streamFormat: 'hls' | 'ts' }` em AsyncStorage (chave `brtv.prefs.v1`, inválido → `'hls'`).
4. `TopBar.tsx`: logo (altura 56), abas Início, TV ao vivo, Filmes, Séries, Favoritos (mesmos rótulos e destinos do webOS `apps/webos/src/components/Brand.tsx`, incluindo a regra Início→`reset`, a partir da Início→`go`, entre abas→`replace`), botão Configurações e relógio HH:MM (atualiza a cada 15 s). Aba ativa sublinhada em lima; abas focáveis com `FocusCard` (variação compacta) sem `autoFocus`.
5. `Activation.tsx` e `Playlists.tsx`: mesma copy e comportamento do webOS (passos numerados, MAC, chave, status, "Verificar agora", QR, aviso legal; polling de 10 s; 1 lista → `reset(home)`, várias → `reset(playlists)`).
6. Manifesto (`withLeanback.js`): além do leanback, declarar `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>` e `android.hardware.faketouch` com `required="false"`, sem duplicar entradas existentes.
7. Telas ainda não feitas (home, live, movies, series, seriesDetail, settings, about) podem ser placeholders mínimos com `TopBar` e um título — as Tasks 3 e 4 as substituem. A TV ao Vivo atual pode ficar como placeholder também.

## Task 3: Início e TV ao Vivo no Android

Arquivos: criar `apps/android/src/screens/Home.tsx`, `apps/android/src/screens/Live.tsx`, `apps/android/src/components/PreviewVideo.tsx`, `apps/android/src/components/Artwork.tsx`, `apps/android/src/components/PinGate.tsx`; alterar `apps/android/src/App.tsx` só para trocar os placeholders.

1. `Artwork.tsx`: `ChannelLogo` (72×72, logo da lista com `resizeMode="contain"` sobre `surfaceElevated`; sem logo ou com erro → iniciais) e `Poster` (2:3, imagem `cover`; sem imagem → arte gerada com tom de `tintFor(título)` e letra grande), mesmos tons do webOS (`apps/webos/src/components/Artwork.tsx`: `#01B260 #ACF602 #15E24D #F6F609 #049F64 #9AF70B`, hash do título).
2. `PreviewVideo.tsx`: `react-native-video` sem som, `paused={false}`, com debounce de 700 ms na URL (400 ms na Início) e opacidade 0 até tocar; erro → fica invisível. Só renderizar quando a tela está no topo (já garantido pela pilha).
3. `Home.tsx` (layout do webOS `apps/webos/src/screens/Home.tsx`): fundo com a prévia do canal em destaque cobrindo a tela e sombras (gradiente: usar `expo-linear-gradient` se já estiver instalado; senão, camadas `View` com opacidade); selo "AO VIVO" + nome do canal; título grande (EPG atual ou nome do canal); subtítulo; botões "Assistir agora" (foco inicial) e "Guia de TV"; meta (grupo e horário ou "Canal N"); trilho horizontal "Seus canais" (até 12, `FlatList`/`FlashList` horizontal) com miniatura 16:9, selo DEMO quando a lista for `demo`, "AO VIVO" e progresso; nome e subtítulo; "Ver todos"; foco num card atualiza o destaque após 250 ms; dicas "OK Selecionar / Voltar" no rodapé.
4. `Live.tsx` (layout do webOS `apps/webos/src/screens/Live.tsx`): coluna de categorias (Favoritos + grupos com contagem / "Bloqueada"), lista de canais com `FlashList` (número, `ChannelLogo`, nome com ★ se favorito, programa atual e progresso), painel de prévia (vídeo 16:9 com `PreviewVideo`, "Ao vivo", nome, grupo, "Agora, das HH:MM às HH:MM" + título + progresso ou "Sem guia de programação para este canal", "A seguir, HH:MM: título", botões Assistir / Favoritar|Remover dos favoritos). Categoria escolhida vai para a rota via `replace`. Categoria bloqueada sem desbloqueio → `PinGate` (mesma copy do webOS) e, ao desbloquear, `update({ unlockedCategories })`. Estados vazios com a copy do webOS.
5. `PinGate.tsx`: `TextInput` numérico seguro de 4 dígitos, "Desbloquear" / "Cancelar", "PIN incorreto. Tente de novo."

## Task 4: Filmes, Séries, Configurações e Sobre no Android

Arquivos: criar `apps/android/src/screens/Vod.tsx` (Movies, Series, SeriesDetail), `apps/android/src/screens/Settings.tsx` (Settings, About); alterar `apps/android/src/App.tsx` só para trocar os placeholders.

1. `Vod.tsx` (comportamento do webOS `apps/webos/src/screens/Vod.tsx`): destaque do item focado (título grande, grupo, "Continuar de MM:SS" em lima se houver posição salva); pílulas de categoria horizontais (categoria vai para a rota via `replace`; bloqueada → `PinGate`); `TextInput` "Buscar título" que busca em todas as categorias liberadas; grade de pôsteres (`FlashList` com 6 colunas) usando `Poster`; vazio com a copy do webOS; "Nada encontrado para “…”." Filme abre o Player (`isLive: false`, `id`); série abre `seriesDetail`.
2. `SeriesDetail`: `loadSeasons` do core; título, grupo, "N temporadas", sinopse; pílulas "Temporada N"; lista de episódios com número grande, título e "Parou em MM:SS"; episódio abre o Player com título "Série, TN EN" e `id` do episódio; erros e carregamento com a copy do webOS.
3. `Settings.tsx` (comportamento do webOS `apps/webos/src/screens/Settings.tsx`, sem a seção "Motor de vídeo", que é só do webOS): seções "Este aparelho" (MAC, Chave), "Reprodução" (formato HLS / MPEG-TS, salva com `savePreferences`), "Lista" (Recarregar lista → `reloadToken+1` com aviso "Recarregando a lista…"; Limpar histórico → zera `history` e `continueWatching` com aviso), "Controle parental" (PIN de 4 dígitos, Salvar/Remover, mensagens iguais), "Categorias bloqueadas" (lista com Bloqueada/Liberada; sem PIN → "Defina um PIN antes de bloquear categorias."), "Sobre e termos".
4. `About`: logo grande, "Versão 0.1.0", aviso legal (mesmo texto do webOS), botão Voltar.
