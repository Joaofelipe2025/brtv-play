# Free-TV no Android TV

O Android usa a playlist pública completa de https://github.com/Free-TV/IPTV:

https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8

Não é necessário copiar o repositório Free-TV nem executar seus scripts Python.
O app baixa o catálogo ao iniciar e em **Configurações → Recarregar playlist**.
O catálogo entra em **TV ao Vivo**, usando o player existente. Não adiciona um
catálogo de filmes ou séries sob demanda.

## Comportamento

- A lista substitui somente a demonstração do mock, preservando o status de ativação e outras listas.
- Nomes, grupos, logos e IDs de EPG são mantidos na leitura. A UI atual do Android não mostra logos nem carrega EPG.
- IDs de favoritos e da lista são únicos mesmo quando o catálogo repete IDs de EPG.
- Timeout de rede: 15 segundos. Validação do cabeçalho M3U, existência de canais e limite de 5 milhões de caracteres após leitura. Content-Length também é verificado quando disponível; não é um limite de memória em streaming.
- A última lista válida fica no AsyncStorage. Falha de atualização usa esse cache com aviso; vídeos ainda exigem internet.
- Sem cache, o erro aparece na tela inicial e o app tenta novamente automaticamente, sem downloads simultâneos.
- Páginas do YouTube, Twitch e Dailymotion ficam no catálogo, com mensagem de incompatibilidade em vez de tentativas inúteis de reprodução.
- Outros canais podem falhar por disponibilidade, região, formato ou HTTP bloqueado pelo Android. A integração não altera a política HTTP do aplicativo.
- Nenhuma lista XMLTV do cabeçalho é baixada automaticamente.
- A fonte completa é lida; entradas sem URL pública e protocolos não reconhecidos pelo parser atual são ignorados. Na amostra de validação havia 2.080 entradas: 2.073 importadas, seis sem stream público e uma RTSP não importada. Das importadas, 140 eram páginas de plataformas externas; importar não significa confirmar reprodução.

## Arquivos

- `packages/core/src/free-tv.ts`: fonte, validação, cache e identificação de canais.
- `apps/android/src/backend.ts`: composição da fonte com o backend atual.
- `apps/android/src/App.tsx`: carregamento, avisos e reprodução.

Para voltar à demonstração, exporte `new MockBackendService()` em `backend.ts` e
remova a leitura de `backend.notice` em `App.tsx` (ou a substitua por `null`).

## Verificação e instalação

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm --filter @brtv/core typecheck
pnpm --filter @brtv/android typecheck
pnpm webos:build
```

Use o processo de APK/atualização já adotado no projeto local. Nesta base do
GitHub, `pnpm android` executa o build de desenvolvimento com Android SDK e JDK
instalados. O comando `android:apk` dos arquivos locais mais recentes ainda não
estava nesta base ao preparar a integração. Não substitua configurações EAS ou
chaves de assinatura do projeto local.

No projetor, confira abertura do catálogo, reprodução de um canal HLS disponível
na região, troca pelo controle, favoritos e recarga em Configurações. Desconecte
a rede após um primeiro carregamento e reabra o app para verificar o aviso do
catálogo salvo; os vídeos não ficam disponíveis offline.

A validação automatizada da importação não confirma disponibilidade de todos
os canais nem substitui o teste no aparelho físico.
