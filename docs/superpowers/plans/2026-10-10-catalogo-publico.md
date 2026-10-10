# Plano — Catálogo público de testes (Free-TV) como lista separada

Base: branch `feat/android-paridade` (estado atual), preservando tudo. Aproveita a lógica do PR #2 (`feat/free-tv-android`), mas **sem** substituir a demonstração nem o `App.tsx` atual. A fonte é uma playlist M3U pública do repositório Free-TV/IPTV (só canais abertos/gratuitos), apresentada como "Catálogo público de testes", numa lista separada que alimenta **só a TV ao Vivo**.

## Global Constraints

- TypeScript strict, sem `any`. `pnpm check` deve passar (lint, typecheck ×3, testes core, build webOS).
- Lógica sem UI em `packages/core` com testes Vitest (TDD); os apps só consomem.
- Preservar: demonstração, listas pessoais M3U/Xtream (filmes, séries, temporadas, episódios, capas), favoritos, histórico, retomada, controle parental, navegação por controle, `ScaledCanvas` do projetor e atualização automática. Não trocar `apps/android/src/App.tsx` pela versão antiga do PR; editar o atual de forma mínima.
- Não mexer em `apps/webos` nesta entrega.
- Copy pt-BR, caixa normal. Texto Android ≥ 24.
- Nenhuma credencial real. A procedência (URL do repo, licença, descrição) fica documentada no código e em `docs/FREE-TV.md`.

## Task 1: Core — módulo free-tv

Arquivos: criar `packages/core/src/free-tv.ts`, `packages/core/test/free-tv.test.ts`; alterar `packages/core/src/index.ts`.

Adaptar do PR #2 o que for bom, **descartando** o `FreeTvBackendService` (que substituía a demo). Exportar:

1. Constantes e procedência:
   - `FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'`
   - `FREE_TV_PLAYLIST_ID = 'free-tv'`
   - `FREE_TV_SOURCE` — objeto documentando origem: `{ repo: 'https://github.com/Free-TV/IPTV', descricao: 'Playlist comunitária de canais gratuitos e oficiais (FAST, TV aberta). Sem canais pagos.', url: FREE_TV_URL }`.
   - `FREE_TV_PLAYLIST: M3uPlaylist = { id: FREE_TV_PLAYLIST_ID, name: 'Catálogo público de testes', kind: 'm3u', url: FREE_TV_URL }` — para a lista aparecer entre as disponíveis.
   - `FREE_TV_CACHE_KEY = 'brtv.free-tv.playlist.v1'`, `FREE_TV_TIMEOUT_MS = 15000`, limite de conteúdo 5_000_000.
2. `parseFreeTvChannels(content: string): M3uChannel[]` — parse via `parseM3u`, com **id único** por entrada (ids de EPG se repetem no catálogo): `free-tv:<base>:<ocorrência>`, onde base deriva de `tvgId||''`, `group`, `url`. (Do PR, item 7 — favoritos sem id duplicado.)
3. `freeTvPlaybackIssue(url: string): string | null` — detecta páginas de vídeo (youtube, youtu.be, twitch, dailymotion, dai.ly) e devolve a mensagem pt-BR do PR; senão `null`. (Item 7.)
4. `loadFreeTvLibrary(opts): Promise<{ library: Library; fromCache: boolean; notice: string | null }>` onde `opts = { storage: KeyValueAdapter; fetchFn?: PlaylistFetch; force?: boolean }`:
   - baixa `FREE_TV_URL` com `AbortController` + `FREE_TV_TIMEOUT_MS`; checa `content-length` (> limite → erro); lê `text()`; valida (`#EXTM3U` no início e ≥ 1 canal).
   - cache: salva o conteúdo válido em `storage` (`FREE_TV_CACHE_KEY`); falha de rede/validação cai para o cache (revalidado). Sem cache válido → lança `Error` com mensagem pt-BR de falha (item 5).
   - `force: true` ("Recarregar lista") ignora o cache na leitura, mas ainda cai para o cache em falha.
   - monta `Library`: `live` = `parseFreeTvChannels` mapeado para `LiveItem` (preservando `group`, `logo` de tvgLogo, `epgId` de tvgId); **`movies: []`, `series: []`** (item 6: só TV ao Vivo, nomes de filme/série não viram VOD); `xtream: null`, `epgUrl: null`.
   - `fromCache`/`notice`: quando serviu do cache, `notice` = aviso pt-BR "Exibindo o último catálogo salvo; os vídeos precisam de internet." (item 5).
   - `PlaylistFetch` = tipo estrutural compatível com `fetch`/`expo/fetch` (`(url, { signal }) => Promise<{ ok; headers: { get }; text() }>`). Padrão: `globalThis.fetch` resolvido no momento da chamada.
5. Testes Vitest (TDD, fetch falso): ids únicos para entradas repetidas; `freeTvPlaybackIssue` cobre youtube/twitch/dailymotion e devolve `null` para `.m3u8`; validação rejeita vazio/sem `#EXTM3U`/grande demais; download ok monta `live` com grupos preservados e movies/series vazios; falha de rede com cache válido devolve `fromCache: true` + notice; falha sem cache lança; `force` rebaixa. Usar apenas `http://exemplo.test` nos testes, nunca a URL real a não ser a constante.

## Task 2: Android — lista separada e proteção do player

Arquivos: `apps/android/src/playlists.ts`, `apps/android/src/App.tsx` (mínimo), `apps/android/src/navigation.tsx` (se precisar de campo de sessão para o aviso), `apps/android/src/components/PreviewVideo.tsx`, `apps/android/src/Player.tsx`, `apps/android/src/screens/Home.tsx` e/ou `Live.tsx` (aviso de prévia), criar `docs/FREE-TV.md`.

1. `availablePlaylists`: acrescentar `FREE_TV_PLAYLIST` ao final da união (backend + userPlaylists + Free-TV), **sem** remover a demo nem as listas do usuário. A Free-TV aparece como "Catálogo público de testes" em Ativação (quando houver mais de uma lista → tela de escolha), Playlists e Configurações. A escolha de lista mostra a Free-TV com um rótulo de procedência ("Fonte pública de teste").
2. `App.tsx` (edição mínima do effect existente): quando `playlist.id === FREE_TV_PLAYLIST_ID`, carregar via `loadFreeTvLibrary({ storage: asyncAdapter, fetchFn: streamingFetch, force: reloadToken mudou })` em vez de `loadLibrary`; setar `library` e, se houver, um aviso (`libraryNotice`) no `Session`. EPG: a Free-TV não tem EPG (`epgUrl: null`), então pula. Em falha, usar o fluxo de `libraryError` já existente (mensagem + "tentar novamente"); a falha **não** afeta a demo nem as listas do usuário, porque cada lista é carregada sob demanda. "Recarregar lista" (reloadToken) rebaixa a fonte.
3. Páginas de vídeo (item 7): em `PreviewVideo` e no `Player`, antes de tocar, checar `freeTvPlaybackIssue(url)`. Se houver issue: não iniciar o vídeo; no Player, mostrar a mensagem (reusar o estado de erro existente, sem contar como falha de reconexão); na prévia, ficar sem vídeo (arte/placeholder). Vale para qualquer lista, não só a Free-TV.
4. Preservar tudo o mais: favoritos (agora com ids únicos vindos do core), histórico, retomada, controle parental, navegação, ScaledCanvas, OTA. Não alterar a demo nem o cadastro de listas.
5. `docs/FREE-TV.md`: o que é a fonte, URL, procedência, licença (o repo não declara; registrar isso), que ela alimenta só a TV ao Vivo, cache/timeout, e os passos para abrir "Catálogo público de testes" no projetor.

Teste: `pnpm check`; `cd apps/android && npx tsc --noEmit`; `npx expo export --platform android` deve empacotar. Verificação manual descrita no relatório (importar, recarregar, simular falha, confirmar que demo/filmes/séries/listas seguem intactas).
