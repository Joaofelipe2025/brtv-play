# Android TV: experiência e entrega de teste

Trabalho feito na branch `fix/android-tv-experience`, no repositório conectado original. Base: `origin/feat/android-paridade` (`2dbb784`), que reúne as integrações existentes. O `main` local ainda estava no commit inicial; não foi usado para substituir as integrações.

## HTTP e atualizações

O último build de teste anterior às mudanças, `0fcb9c17-1f87-4ce2-9053-852aec6ab541`, contém o APK 0.1.0 (versionCode 1), targetSdk 34, canal preview. Inspeção do manifest binário com `node scripts/inspect-apk.mjs dist-apk/previous-preview.apk`:

- SHA-256: `6480f9db4b55fadd3dfd89d1d676141d037c5966250347b0eed3a667b5f40fa5`.
- Não declara `usesCleartextTraffic` nem `networkSecurityConfig` no application.
- `expo.modules.updates.ENABLED=true`, URL do projeto `cf820c71-a13b-4184-8a70-661eea62b83a`, canal `preview`.
- Com targetSdk >= 28, a ausência de permissão explícita resulta em HTTP bloqueado pelo Android. O build anterior efetivamente não permite HTTP no release.

A configuração atual em `apps/android/app.json` usa `expo-build-properties` com `android.usesCleartextTraffic=true`. `expo config --type introspect` confirmou esse atributo no manifest resultante e ausência de Network Security Config. O plugin Leanback não sobrescreve a política. O manifest dentro do APK novo ainda precisa ser conferido antes de confirmar a correção no artefato.

Referências: [política de rede Android](https://developer.android.com/privacy-and-security/security-config), [atributo application](https://developer.android.com/guide/topics/manifest/application-element), [EAS Update](https://docs.expo.dev/eas-update/introduction/).

Uma mudança no manifest não chega por EAS Update. O APK anterior precisa ser substituído. O build novo usa 0.1.1, versionCode 2, runtime 0.1.1, perfil e canal preview, mantendo as credenciais remotas existentes. Isso evita entregar o código destinado ao novo runtime ao APK antigo. Mudanças futuras apenas em JavaScript podem chegar automaticamente nesse runtime.

`HTTP BLOQUEADO` corresponde a Media3 2007/22007 ou exceção cleartext. `HTTP 401/403` é recusa do servidor, não a política Android. TLS continua validando certificados; não houve conversão de URLs nem alteração da confiança de certificados. O classificador também aceita códigos nativos numéricos. Não foram expostas URLs/credenciais na interface.

## Player e navegação

- Pausa solicitada e pausa confirmada pelo player nativo são separadas. O feedback central anima apenas opacidade pelo native driver; o indicador persistente informa a pausa confirmada.
- Controles aparecem ao usar o controle e ao receber foco; somem após cinco segundos de inatividade durante reprodução. Pausa, erro e conexão não ocultam controles automaticamente.
- D-pad navega pelos controles visíveis; troca de canal por cima/baixo fica disponível com OSD oculto e CH+/CH- continuam funcionando.
- Conexão, buffering, reconexão, troca de fonte e erro têm mensagens próprias. Tempo e barra continuam disponíveis para VOD; ao vivo não inventa duração.
- A troca de fonte transfere posição e pausa diretamente, inclusive posições inferiores a cinco segundos. Mantém também a persistência já existente e as políticas de reconexão.

## Listas e catálogo

- Busca por botão focável, borda visível no campo, filtros ativos explícitos, limpeza de busca/filtros, ordenação alfabética e por inclusão.
- Busca respeita também a categoria selecionada. PIN e bloqueios parentais permanecem aplicados.
- Retenção de busca, ordenação, favoritos, foco e deslocamento ao voltar no catálogo paginado. Cache de navegação limitado a duas janelas de até 300 itens; nenhum catálogo completo é baixado por essa tela.
- Skeletons no início, spinner discreto nas próximas páginas, preservação dos itens durante carregamento, deduplicação de IDs e rejeição de respostas de gerações anteriores. Erro, catálogo vazio e ausência de resultados têm mensagens próprias.
- TV ao vivo recebe busca, limpeza, indicação de categoria, foco do campo e retenção de seleção/deslocamento.

## Datas e ordenação

As fontes Saimo utilizadas têm ano em certos títulos, mas não data de inclusão: ano de lançamento não é inclusão. O M3U pode fornecer `added` (epoch em segundos) ou `date-added` (ISO), agora preservados pelo preparador. Sem metadados, `first-seen.json` mantém a primeira aparição por ID no servidor/CI.

No primeiro snapshot todos os itens antigos recebem `null` no registro, sem data inventada. Em atualizações posteriores, IDs novos recebem a hora da observação. IDs removidos ficam no registro para que uma reaparição não seja falsamente considerada inclusão nova. O workflow restaura o registro de `catalog-data` antes de preparar ambas as fontes. Ele não é baixado pelo app.

O preparador ordena todo o catálogo antes de criar páginas de 30 itens, páginas por categoria e índices de busca. Itens com data conhecida vêm primeiro; desconhecidos têm desempate alfabético. São emitidas também páginas e índices alfabéticos. Versões antigas continuam legíveis, com sua ordenação antiga, até o manifest atualizado chegar. “Adicionados recentemente” é inclusão/observação no catálogo; não uma lista de lançamentos cinematográficos.

## Validação e limites

Lint, typecheck de core/webOS/Android, 215 testes do core, três testes do preparador e build webOS passaram. Os testes de catálogo verificam a inclusão de um título novo além da primeira página original, a ordenação antes da paginação, o registro sem datas para o acervo antigo, persistência e ordenação alfabética. Testes de diagnóstico cobrem 401/403, cleartext, TLS e proteção de dados.

Não houve execução em TV física/emulador nesta máquina. Confirmar D-pad, teclado, pausa/buffering reais, avanço/retomada entre fontes equivalentes e legibilidade no aparelho continua sendo validação manual. Não houve teste de acesso a cada fonte comercial. Trocar fontes com edições/durações diferentes pode exigir ajustar a posição. Favoritos pessoais mantêm sua paginação por IDs, sem promessa de ordenação global por inclusão; listas próprias M3U/Xtream continuam no fluxo legado já existente, enquanto as melhorias de ordenação/paginação global são para os catálogos estáticos integrados. Não se alterou o backend, ativação, EPG, áudio, legendas ou PIN.

## Instalação por cima

Instalar o APK novo de preview usando o mesmo pacote e a mesma assinatura preserva dados e listas. Não desinstalar o anterior. Pelo ADB: `adb install -r caminho-do-apk.apk`. Pela TV/projetor: transferir/baixar o APK e escolher atualizar o app existente. Se o Android recusar por assinatura diferente, interromper: desinstalar apagaria os dados, e a assinatura do APK instalado deve ser verificada primeiro. Depois abrir o app conectado à internet para receber atualizações do runtime 0.1.1.

## Publicação

Build de teste solicitado: [14856dd5-532b-400c-a58f-e626a4fca3a4](https://expo.dev/accounts/brtv-play/projects/brtv-play/builds/14856dd5-532b-400c-a58f-e626a4fca3a4). Estado e inspeção final serão registrados após confirmação do EAS. Publicação de catálogo e EAS Update também exige confirmação do workflow/serviço; uma solicitação não significa publicação concluída.
