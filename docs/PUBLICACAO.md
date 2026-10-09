# Guia de publicação — BRTV PLAY

Como levar o app para a **LG Content Store** (webOS) e para a **Google Play** (Android TV), no modelo de player de listas (como FunPlay TV e similares): o app não traz conteúdo e a pessoa conecta a própria lista pelo portal.

> As exigências das lojas mudam. Confira a documentação atual de cada uma antes de enviar. Este guia registra o que o projeto já atende e o que ainda falta.

## 1. Antes de qualquer loja

| Item | Situação |
|---|---|
| Backend real (portal de ativação, vínculo MAC + chave, listas, status de teste/ativo) | **Falta.** O app usa `MockBackendService`; ver "Backend" no README |
| Política de privacidade e termos de uso numa URL pública, seguindo a LGPD (o app guarda MAC, listas e histórico no aparelho) | **Falta** |
| Pessoa jurídica (CNPJ) | Recomendado. Lojas e meios de pagamento pedem dados verificados |
| Consulta jurídica | Recomendado. A Anatel vem bloqueando IPTV pirata no Brasil. Um player genérico é legal, mas o risco está em como ele é divulgado e vendido |
| Nenhum conteúdo, lista ou link real dentro do app | **Atendido.** A demonstração só usa streams públicos de teste da Mux |
| Aviso "não fornece conteúdo" visível no app | **Atendido** (Ativação e Sobre) |

## 2. Regras de conteúdo (vale para as duas lojas)

- Capturas de tela e descrição **sem** logos, nomes ou imagens de canais e filmes reais. Use a lista de demonstração.
- A descrição deve dizer que o app é um reprodutor e que o usuário fornece as listas.
- Apps de IPTV costumam ser rejeitados por propriedade intelectual quando parecem distribuir conteúdo. Evite termos como "canais grátis" e "todos os canais".

## 3. LG Content Store (webOS)

1. Criar conta de vendedor no **LG Seller Lounge** (pessoa física ou jurídica).
2. Gerar o pacote: `pnpm webos:package` → `dist-ipk/app.brtvplay.player_<versão>_all.ipk`.
   - `appinfo.json` já tem `resolution` 1920x1080, `disableBackHistoryAPI`, `requiredACG: []` e os ícones (80x80 e 130x130).
   - Antes de cada envio, aumente `version` em `apps/webos/public/appinfo.json`.
3. Testar numa TV em Developer Mode: `pnpm webos:device` e depois `pnpm webos:install tv`.
4. Cadastrar o app no Seller Lounge: descrição, capturas em 1920x1080, classificação etária, países e URL da política de privacidade.
5. A LG faz testes funcionais (navegação só pelo controle, tecla Voltar, estabilidade) e revisão de conteúdo. Conte com algumas semanas.

## 4. Google Play (Android TV)

1. Criar conta no **Play Console** (taxa única de US$ 25) e concluir a verificação de identidade.
   - Contas pessoais novas precisam de um teste fechado com testadores por algumas semanas antes da produção. Contas de organização não têm essa exigência.
2. Gerar o AAB assinado com **EAS Build** (Expo), no nível de API exigido no ano.
   - Antes de cada envio, aumente `version` e `android.versionCode` em `apps/android/app.json`.
3. Ativar o formato **Android TV** no Play Console. Ele tem revisão própria, que confere:
   - navegação completa por D-pad (sem depender de toque);
   - banner do launcher: **atendido** (`tv_banner.png`, gerado por `pnpm brand:assets`);
   - toque e faketouch como não obrigatórios no manifesto: **atendido** (plugin `withLeanback.js`);
   - capturas de tela de TV.
4. Preencher os formulários de **segurança de dados** e de **classificação de conteúdo**.

## 5. Ponto de atenção: ativação paga

A tela de ativação manda a pessoa ao portal para ativar. Se a ativação for paga, as regras de pagamento do Google Play limitam apps que direcionam para compra fora da loja, e essas regras mudam conforme o país. Antes de publicar, escolha um caminho:

- **Cobrar pelo Google Play Billing** dentro do app; ou
- **Manter o pagamento fora da loja**, sem preço nem link de compra dentro do app. A tela mostraria só o MAC, a chave e o endereço do portal para cadastrar a lista.

A LG tem regras próprias sobre pagamento externo. Confira no Seller Lounge.

## 6. Checklist de envio

- [ ] `pnpm check` passando (o CI roda em todo Pull Request)
- [ ] Backend real configurado no lugar do mock
- [ ] Versão aumentada (`appinfo.json` e `app.json`)
- [ ] Teste em TV LG real e em Android TV real (emulador no mínimo)
- [ ] Política de privacidade e termos publicados
- [ ] Capturas e descrição sem conteúdo de terceiros
- [ ] Modelo de cobrança definido conforme a seção 5
