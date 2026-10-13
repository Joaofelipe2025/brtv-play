# Diagnóstico de vídeo no Android TV

O catálogo do GitHub contém metadados e endereços; ele não hospeda os vídeos.
O APK reproduz as URLs da fonte com react-native-video/ExoPlayer. Não é preciso
uma API ou VPS para reproduzir um endereço de mídia válido e acessível.
Uma página de outro player (por exemplo Saimo TV) não substitui uma URL de mídia
ou uma integração oficial de catálogo/reprodução.

Nesta atualização, filmes/episódios recebem 45 segundos sem avanço antes de uma
única reconexão automática. TV ao vivo mantém 12 segundos e três reconexões.
O contador só é zerado quando currentTime avança, não apenas quando o player
informa intenção/estado de reprodução. Pausa não conta como travamento.

O erro nativo agora é classificado e aparece na tela, sem endereço completo,
credenciais ou stack trace. Bloqueios explícitos HTTP 401/403, arquivo ausente,
limite de requisições, incompatibilidade de formato e DRM interrompem as
tentativas automáticas. Ainda é possível tentar manualmente ou voltar.

## Teste no aparelho

1. Abra o mesmo título que falhou e anote/fotografe o código e o nome do título.
2. Na tela de erro selecione **Testar vídeo de demonstração**. O teste usa o
   Big Buck Bunny HLS do catálogo de demonstração, com o mesmo player.
3. Se o teste funcionar, isso confirma reprodução desse formato nessa rede;
   não garante acesso a outra fonte nem suporte ao codec de todos os filmes.

| Código | Próximo passo |
| --- | --- |
| HTTP 401/403 | Conferir autorização, validade do link e liberação com a fonte. |
| HTTP 404/410 | Atualizar ou substituir o endereço ausente na lista. |
| HTTP 429 / HTTP 5xx | Aguardar; verificar disponibilidade/limites da fonte. |
| HTTP BLOQUEADO | Verificar o APK instalado e sua configuração de rede; exige build nativo se faltar a permissão. |
| DNS / CONEXÃO / TEMPO ESGOTADO | Conferir rede do aparelho e disponibilidade do servidor. |
| TLS | Conferir relógio do aparelho e certificado do servidor. |
| FORMATO / CONTEÚDO | Conferir codec, resolução e se a resposta realmente é mídia. |
| DRM | A fonte deve fornecer uma integração de licença compatível. |
| SEM AVANÇO | Não houve erro nativo específico; comparar demonstração e coletar logs do aparelho. |

O projeto já declara usesCleartextTraffic no expo-build-properties. Isso precisa
ter sido incorporado ao APK instalado; EAS Update não altera o manifesto Android.
HTTP em uma página HTTPS também pode falhar por conteúdo misto no navegador,
uma situação diferente do player nativo.

O teste remoto realizado em 13/10/2026 não comprova o comportamento da rede do
projetor. Diagnóstico no aparelho continua necessário. Hospedar um proxy por si
só não resolve links expirados, autorização, formato incompatível ou DRM.
