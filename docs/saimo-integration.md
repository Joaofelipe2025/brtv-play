# Catálogo Saimo no Android TV

Abra **Configurações → trocar lista** (ou a tela de listas) e selecione
**Saimo · Filmes e séries**. Filmes, séries, animes e doramas usam as telas de
catálogo paginado e a busca do BRTV. O catálogo anterior continua separado;
seus favoritos e posições não são apagados nem associados a outro título.

O Android recebe primeiro um manifesto e depois páginas de 30 títulos. URLs de
reprodução e alternativas só são baixadas ao abrir um filme ou uma página de
episódios. A preparação acontece no GitHub Actions. Não é necessário servidor
de vídeo próprio: o player acessa a origem indicada pelo catálogo.

## Fontes e reprodução

- As versões dubladas têm prioridade; versões legendadas continuam disponíveis.
- Cada URL é tentada uma vez por rodada quando há alternativas. Erros nativos
  avançam à próxima fonte; falta de progresso por 20 segundos também avança.
- **Trocar fonte** permite avançar manualmente pelo controle remoto. A posição
  salva é retomada quando a duração do novo vídeo permite a busca.
- Ao esgotar as fontes, o app exibe o erro e permite reiniciar a rodada ou testar
  o vídeo de demonstração. Links únicos conservam a política anterior de retry.
- Catálogo disponível não comprova disponibilidade do vídeo. Bloqueios da origem,
  expiração de links e codecs incompatíveis ainda podem impedir reprodução.
  A integração não contorna autenticação ou bloqueios de acesso.

## Preparação e atualização

`pnpm catalog:saimo` obtém a revisão fixada em `saimo.config.json`. Para mudar o
snapshot, atualizar `revision` para um commit verificado e executar a publicação.
Índice de bases, listas, episódios, capas e fontes desativadas são lidos do mesmo
commit. Nenhum programa do repositório externo é executado. Um checkout local
pode ser usado com `--source-dir /caminho/SaimoPlayer`.

O importador lê `vod/indice.txt`, `filmes-*.txt`, `series-*-*.txt`,
`redeflix/links-animes.txt`, `redeflix/links-doramas.txt`, `fichas.txt` e
`fontes-mortas.txt`. Remove URLs repetidas e fontes marcadas como desativadas
nesse snapshot. Não consulta o monitor remoto de disponibilidade. Canais ao vivo
e a seção reservada do Saimo não fazem parte desta importação VOD.

Saída em `catalog-output/saimo`: versões imutáveis cujo hash inclui os dados e
o preparador. O manifesto só muda após a geração completa. O workflow publica
em `catalog-data/saimo` e, com `EXPO_TOKEN`, envia uma atualização EAS para o canal
`preview`, sem alterar a versão nativa. A validação física no projetor deve
conferir reprodução, troca de fonte, retomada e navegação pelo controle.
