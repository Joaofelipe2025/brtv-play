# Catálogo público de testes (Free-TV)

O BRTV PLAY oferece, além da demonstração e das suas listas, uma lista separada chamada **Catálogo público de testes**. Ela serve para testar o app no projetor com canais de verdade, sem precisar cadastrar uma lista própria. A demonstração e as listas pessoais (M3U e Xtream) continuam como sempre foram.

## O que é a fonte

- Playlist M3U comunitária de canais gratuitos e oficiais (FAST e TV aberta), mantida pelo projeto Free-TV/IPTV. Não inclui canais pagos.
- Link usado (`FREE_TV_URL`, em `packages/core/src/free-tv.ts`): `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`
- Sem credenciais: o link é público.

## Procedência e licença

- Repositório de origem: <https://github.com/Free-TV/IPTV>
- O repositório **não declara uma licença**. O app não embute a lista no código nem no APK: ela é baixada do GitHub no aparelho, a cada abertura, e só fica guardada no cache local desse aparelho. Consulte o repositório antes de redistribuir qualquer parte dela.
- A procedência também está no código: `FREE_TV_SOURCE`, em `packages/core/src/free-tv.ts`.
- Na escolha de lista e nas Configurações, o catálogo aparece com o rótulo "Fonte pública de teste".
- O BRTV PLAY continua sendo apenas um reprodutor. O conteúdo é de terceiros e a disponibilidade dos canais pode mudar a qualquer momento.

## O que o catálogo alimenta

- **Somente a TV ao Vivo.** Filmes e séries ficam vazios nesta lista: nomes de filme ou série dentro da playlist pública não viram VOD.
- Não há guia de programação (EPG) para esta lista.
- Cada canal ganha um id próprio e único (os ids de EPG do catálogo se repetem), então favoritar um canal não marca outros por engano. Histórico, favoritos e controle parental funcionam como nas outras listas.
- Canais que apontam para páginas de vídeo (YouTube, Twitch, Dailymotion) não são mídia para o player nativo. O app avisa "Este canal usa uma página de vídeo externa..." em vez de tentar reconectar. Isso vale para qualquer lista.

## Download, cache e tempo limite

- Toda vez que a lista é aberta, o app **tenta a internet primeiro**, com tempo limite de 15 segundos. O conteúdo é validado (começa com `#EXTM3U`, tem ao menos um canal e até 5 MB) e, se válido, é salvo no cache local (`brtv.free-tv.playlist.v1`).
- Se o download falhar (sem internet, tempo esgotado, resposta inválida ou grande demais), o app mostra o **último catálogo salvo**, com o aviso "Exibindo o último catálogo salvo; os vídeos precisam de internet." na Início e na TV ao Vivo.
- Sem internet e sem cache, a Início mostra "Não foi possível carregar o catálogo público de testes..." e a pessoa pode voltar às configurações, trocar de lista ou tentar de novo com **Recarregar lista**.
- **Recarregar lista** (Configurações) baixa a fonte de novo.
- Uma falha do catálogo não afeta a demonstração nem as listas pessoais: cada lista é carregada só quando é aberta.

## Como abrir no projetor

1. Instale o APK atual e abra o BRTV PLAY (veja [INSTALAR-NO-PROJETOR.md](INSTALAR-NO-PROJETOR.md)).
2. Na **Ativação**, quando houver mais de uma lista (a demonstração ou uma lista sua, mais o catálogo), o app abre a tela **"Qual lista você quer abrir?"**. Escolha **Catálogo público de testes** (rótulo "Fonte pública de teste").
3. Se você já estiver dentro de uma lista: **Configurações → Minhas listas → Trocar de lista** e escolha o **Catálogo público de testes**.
4. Para voltar à demonstração ou às suas listas, repita o passo 3 e escolha a outra lista.
5. Para atualizar o catálogo: **Configurações → Lista → Recarregar lista**.
