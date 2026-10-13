# Plano — Listas do usuário (cadastro no próprio aparelho, para teste)

Spec: `docs/superpowers/specs/2026-10-08-brtv-play-design.md` (seções 3 e 4). Enquanto o backend/portal não existe, a pessoa precisa conseguir cadastrar a própria lista direto no aparelho: Xtream Codes (servidor, usuário, senha) ou link M3U. A lista fica **só no aparelho** (AsyncStorage no Android, localStorage no webOS); nunca vai para o código, repositório ou serviços externos.

## Global Constraints

- TypeScript strict, sem `any`. Devem passar: `pnpm check` (lint, typecheck dos 3 pacotes, testes, build do webOS).
- Lógica sem UI vai em `packages/core` com testes Vitest (TDD); os apps só consomem.
- Copy em pt-BR, frases em caixa normal, idêntica nas duas plataformas.
- Navegação 100% por controle remoto; foco inicial no conteúdo (nunca nas abas); webOS compatível com Chromium 68; Android com `FocusCard`/`Text`/`Title`/`Body` de `apps/android/src/ui.tsx` e texto ≥ 24.
- Nenhuma credencial ou URL real em código, testes ou documentação (use `http://exemplo.test:8080`, `usuario`, `senha`).
- Campo de senha mascarado. Não registrar senha em logs.

## Task 1: Core — listas do usuário e M3U por URL

Arquivos: `packages/core/src/userPlaylists.ts` (novo), `packages/core/test/userPlaylists.test.ts` (novo), `packages/core/src/api.ts`, `packages/core/src/library.ts`, `packages/core/src/store.ts`, `packages/core/test/library.test.ts`, `packages/core/test/store-device-api.test.ts`, `packages/core/src/index.ts`.

1. `api.ts`: `M3uPlaylist` passa a aceitar `content?: string` **ou** `url?: string` (pelo menos um). O mock continua usando `content`.
2. `library.ts`: `loadLibrary` com M3U sem `content` e com `url` baixa o texto via `fetchFn` (`response.text()`); resposta `!ok` → erro `Falha ao baixar a lista (HTTP N)`. Teste com fetch falso.
3. `userPlaylists.ts`:
   - `normalizeServer(input)`: aceita `exemplo.test:8080`, `http://exemplo.test:8080/`, `https://...`, e URLs com caminho `/get.php`/`/player_api.php` → devolve `protocolo://host[:porta]` sem barra final. Sem protocolo → `http://`. Entrada vazia/inválida → `null`.
   - `xtreamFromUrl(url)`: se a URL tiver `username` e `password` na query (ex.: `get.php?username=…&password=…&type=m3u_plus` ou `player_api.php?…`), devolve `{ server, username, password }`; senão `null`.
   - `createUserPlaylist(input)` com `input = { kind: 'xtream'; name?; server; username; password } | { kind: 'm3u'; name?; url }` → `Playlist` com `id` `user-<timestamp base36>-<aleatório>`, nome padrão "Minha lista". Um M3U cujo link é Xtream (`xtreamFromUrl`) vira playlist `xtream`. Valida campos obrigatórios e lança `Error` com mensagem em pt-BR ("Informe o servidor.", "Informe o usuário e a senha.", "Informe o link da lista.", "Endereço do servidor inválido.").
4. `store.ts`: estado `userPlaylists: Playlist[]` com ações `addUserPlaylist(p)` (substitui se o id já existir) e `removeUserPlaylist(id)`; persistido e reidratado como o resto do estado (hydrate valida que é array de objetos com `id`, `name`, `kind`). Testes de persistência.
5. Exportar tudo pelo `index.ts`. TDD.

## Task 2: webOS — tela "Adicionar lista" e lista de listas

Arquivos: `apps/webos/src/context.ts` (rota `addPlaylist`), `apps/webos/src/App.tsx`, `apps/webos/src/screens/AddPlaylist.tsx` (novo), `apps/webos/src/screens/Settings.tsx`, `apps/webos/src/screens/Activation.tsx`, `apps/webos/src/screens/Playlists.tsx`, `apps/webos/src/styles.css`.

1. Listas disponíveis = `status.playlists` (backend) + `store.userPlaylists`. A Ativação usa essa união para decidir: 1 lista → abre; mais de uma → "Escolha uma lista". A tela de escolha mostra todas (as do usuário com o rótulo "Adicionada neste aparelho").
2. `AddPlaylist`: seletor segmentado **Xtream Codes** | **Link M3U**; Xtream: campos Servidor (placeholder `http://exemplo.com:8080`), Usuário, Senha (mascarada) e Nome (opcional); M3U: Link e Nome. Botão **Salvar e abrir**: cria com `createUserPlaylist`; se Xtream, testa `XtreamClient.authenticate()` antes de salvar, mostrando "Verificando…" e, em erro, "Não foi possível entrar. Confira o servidor, o usuário e a senha." (falha de rede: "O servidor não respondeu. Confira o endereço e a conexão."). Sucesso: `addUserPlaylist`, `update({ playlist })`, `reset({ name: 'home' })`. Botão **Cancelar** volta. Foco inicial no primeiro campo do formulário ativo. Dígitos e letras digitáveis nos inputs (o `installRemote` já não intercepta dígitos em inputs; confirme que letras e Enter também funcionam).
3. Configurações: nova seção **Minhas listas** com: lista atual, botões "Adicionar lista" (abre `addPlaylist`), "Trocar de lista" (abre `playlists`, só se houver mais de uma) e, para cada lista do usuário, "Remover" (se for a lista atual, volta para a demonstração/primeira disponível).
4. Copy: título "Adicionar lista"; ajuda "Use os dados que o seu provedor enviou. A lista fica salva só neste aparelho."

## Task 3: Android — mesma funcionalidade

Arquivos: `apps/android/src/navigation.tsx` (rota `addPlaylist`), `apps/android/src/App.tsx`, `apps/android/src/screens/AddPlaylist.tsx` (novo), `apps/android/src/screens/Settings.tsx`, `apps/android/src/screens/Activation.tsx`, `apps/android/src/screens/Playlists.tsx`.

Mesmo comportamento, copy e validações da Task 2, com `TextInput` (senha com `secureTextEntry`, `autoCapitalize="none"`, `autoCorrect={false}`, teclado `url` para servidor/link), `FocusCard` para botões e seletor, foco inicial no primeiro campo (`autoFocus`/`hasTVPreferredFocus`), Voltar desempilha. A tela fica dentro do `ScaledCanvas` (já global).
