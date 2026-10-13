# Filmes e séries sob demanda

A lista **Filmes e séries · Catálogo** é independente das listas pessoais, da
demonstração e do catálogo de canais. Selecione-a em **Trocar de lista**, depois
abra **Filmes** ou **Séries**.

O Android nunca baixa o M3U original. Um preparador Node lê a fonte linha a linha
no computador/CI e publica arquivos estáticos pequenos. Não são baixados,
hospedados ou retransmitidos os vídeos. O player usa a URL original ao assistir.

## Preparar

```bash
pnpm catalog:build
# Ou usar uma cópia local, sem baixar a origem novamente:
pnpm catalog:build --input /caminho/lista.m3u8 --output catalog-output
```

A fonte está em `catalog.config.json`. A saída em `catalog-output/` é ignorada
pelo Git do código e não entra no bundle do app. `build-report.json` informa
contagens, duplicatas, problemas e tamanhos, sem listar URLs de mídia.

Na amostra analisada: **30.203 filmes, 8.444 séries e 286.151 episódios**; nenhuma
entrada descartada. Manifesto: **4.476 bytes**. Primeira página de filmes:
**5.604 bytes**. Maior arquivo gerado: **21.945 bytes**. O conjunto completo ocupa
aproximadamente 93 MB na hospedagem, dividido em cerca de 61 mil arquivos; esse
conjunto não é transferido inteiro para o aparelho.

## Como carrega

- Primeira abertura: só o manifesto. A primeira página vem ao abrir Filmes/Séries.
- Cada página contém 30 resumos. O foco perto do fim carrega a próxima página;
  **Carregar mais** também funciona. A janela fica limitada a aproximadamente
  300 resumos; para avançar além disso o botão abre outro bloco. **Voltar ao começo**
  reinicia a consulta. Não se mantém o catálogo inteiro na memória.
- Séries: o detalhe contém os números das temporadas; os episódios vêm em páginas
  de 30 apenas ao escolher uma temporada.
- A busca é global por **início de palavras**, sem diferenciar maiúsculas/acentos.
  Exige ao menos uma palavra de três caracteres. Não oferece busca aproximada por
  erro de digitação nem por um trecho no meio da palavra.
- O índice de busca tem 256 partes por tipo. A consulta busca a parte correspondente
  à palavra mais longa, em lotes de até seis páginas de 100 resumos, e entrega até
  30 resultados. A continuação retoma exatamente de onde parou. **Carregar mais**
  continua a pesquisa mesmo se um lote não encontrar resultados.
- Resumos e índices não incluem URLs de vídeos. Filmes obtêm a URL ao selecionar
  Assistir; séries obtêm URLs somente da página de episódios selecionada.
- Capas só carregam para itens montados na janela virtualizada, com quatro cargas
  simultâneas e fallback visual. Não há prévias automáticas nesse catálogo.
- Favoritos e posições usam IDs estáveis. Categorias bloqueadas não aparecem nos
  resultados nem nos favoritos; abrir a categoria pede PIN. Configurações inclui
  as categorias do manifesto mesmo quando suas páginas ainda não foram abertas.
- O botão Favoritos dentro de Filmes/Séries filtra o tipo atual. O Favoritos do
  menu superior abre os filmes favoritos desse catálogo; séries favoritas estão
  acessíveis pelo botão da aba Séries. As listas antigas mantêm seu comportamento.

## Cache e integridade

O cache serializado é limitado conservadoramente a 900 KB; o manifesto é
priorizado na expulsão de páginas. Páginas ficam válidas por um dia. Em falha de
rede podem ser reaproveitadas por até sete dias. Não é um download offline do
catálogo: páginas nunca visitadas e vídeos continuam exigindo rede.

Pedidos simultâneos da mesma URL são compartilhados. Cada pedido tem timeout de
15 segundos e rejeita respostas maiores que 512 KB (Content-Length quando
disponível e tamanho após leitura). Esse limite não substitui controle de bytes
em streaming para uma hospedagem não confiável.

O app valida o formato dos dados antes de salvar. Uma atualização inválida não
substitui o manifesto válido em cache. Cada navegação usa uma versão fixa, sem
misturar páginas de versões diferentes. Respostas antigas são ignoradas ao mudar
de consulta/tela. O preparador atualiza o manifesto somente depois de todos os
arquivos daquela versão estarem escritos; a publicação Git é um commit atômico.

Os IDs não dependem da posição na lista nem de parâmetros transitórios da URL.
Filmes consideram título, categoria e ID de origem/nome do arquivo. Episódios
consideram série, temporada, episódio e ID de origem/nome do arquivo. Séries
consideram título (incluindo ano se fornecido), categoria e nome do arquivo de
capa para separar homônimos. Mudanças nesses campos podem gerar novos IDs; não é
possível garantir identidade editorial quando a fonte não fornece um identificador
estável. Capas diferentes podem separar duas edições de uma mesma série.

## Publicar os dados

O workflow **Publicar catálogo e atualização Android** roda ao enviar a branch
`feat/paged-vod-catalog`. Ele verifica o código, prepara os dados e publica na
branch `catalog-data`, preservando versões anteriores. Também aceita execução
manual quando o workflow estiver disponível na branch padrão do GitHub.

URL-base padrão para o protótipo:

```text
https://raw.githubusercontent.com/Joaofelipe2025/brtv-play/catalog-data
```

GitHub Raw é usado aqui para o teste e pode manter cache por alguns minutos. Uma
CDN/hospedagem estática pode substituir esse endereço por
`EXPO_PUBLIC_CATALOG_BASE_URL`. Copie a árvore completa da versão e por último
`manifest.json`. Não é necessário servidor de aplicação. Não apague versões ainda
usadas por aparelhos; há cache de até sete dias. Para uso continuado, planeje a
retenção das versões na hospedagem, pois cada versão aumenta o armazenamento.

Atualizar os arquivos de dados não exige EAS nem novo APK. O preparador não fica
agendado automaticamente; execute-o quando quiser atualizar a fonte.

## Publicar o app

Se o segredo `EXPO_TOKEN` estiver configurado no repositório, o mesmo workflow
publica no canal **preview** já utilizado pelo projeto. Sem esse segredo ele
publica somente o catálogo e emite um aviso. Não crie nem envie tokens no chat.
Use a sessão Expo já autorizada no computador:

```bash
git pull
pnpm install --frozen-lockfile
pnpm android:update
```

Execute esses comandos na branch que recebeu a implementação. Não há dependência
nativa nova, alteração de assinatura, canal ou runtimeVersion nesta mudança. Um
APK compatível com o canal preview poderá baixar a atualização publicada.

## Validação

`pnpm check` cobre lint, tipos, testes do core, teste do preparador e build webOS.
O bundle Android também pode ser validado com:

```bash
pnpm --filter @brtv/android exec expo export --platform android --output-dir /tmp/brtv-export
```

Os testes cobrem paginação, busca global/continuação, bloqueios na busca,
deduplicação, IDs, cache, timeout e preservação da versão anterior. Validação do
bundle não é teste no projetor. No aparelho, confira foco do D-pad, retomada do
vídeo, PIN, rolagem, perda de rede e troca de categorias durante uma busca. A
disponibilidade dos vídeos na origem não foi verificada em massa.
