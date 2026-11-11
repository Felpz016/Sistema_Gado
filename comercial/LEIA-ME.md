# Lote Certo (versão comercial)

Sistema de controle de gado de corte por lote, vendido por assinatura. É um projeto **separado** do sistema
pessoal da Fazenda São João, que continua intacto na raiz deste repositório.

O que tem aqui:

| Pasta | O que é |
|---|---|
| `site/` | Site de vendas. Vai para a raiz do endereço. |
| `src/`, `public/` | O sistema. Vai para `/app/`. Funciona sem internet. |
| `firestore.rules` | Regras de acesso do banco. |
| `testes/` | Teste automático de ponta a ponta. |

## Como funciona o acesso

1. Qualquer pessoa entra com a conta Google. Isso só cria o cadastro.
2. Sem assinatura ativa, a pessoa vê a tela "Falta ativar a assinatura" e não consegue ler nem gravar nada.
3. O administrador abre **Assinantes** (`/app/#admin`) e toca em **Liberar acesso**. Pode pôr uma data de validade ou deixar sem prazo.
4. A tela do cliente se atualiza sozinha. Ele dá nome à primeira fazenda e começa a usar.
5. Cada conta pode ter várias fazendas e incluir sócio ou funcionário pelo e-mail Google.

Quem bloqueia de verdade é o banco (`firestore.rules`), não a tela. Mesmo alguém mexendo no navegador não lê
dados de outra conta nem libera a própria assinatura.

## O que ainda está em aberto

- **Preço**: bloco `PRECO` no fim de `site/index.html`.
- **Plataforma de compra**: `LINKS.premium` no fim de `site/index.html` e `LINK_ASSINAR` em `src/firebase-config.js`.
- **Liberação automática**: hoje a liberação é manual, pela tela Assinantes. Quando a plataforma de compra for
  escolhida, o aviso de pagamento dela pode gravar o documento `assinaturas/{conta}` sozinho.

## Colocar no ar

1. O projeto Firebase é o `lote-certo-2ec77`. A publicação é automática pelo GitHub Actions (`.github/workflows/publicar-lote-certo.yml`), com os segredos `LOTE_CERTO_SERVICE_ACCOUNT` e `LOTE_CERTO_ADMIN_EMAIL`. Os passos abaixo são para fazer à mão.
2. Firestore: criar o banco em `southamerica-east1`.
3. Authentication: ativar o login com Google.
4. Colar o `firebaseConfig` do app Web em `src/firebase-config.js`.
5. Em `firestore.rules`, trocar `SEU_EMAIL@gmail.com` pelo e-mail do administrador.
6. Publicar:
   ```
   npm ci
   npm run build
   npx firebase-tools deploy --only hosting,firestore:rules --project ID_DO_PROJETO
   ```

## Testar no computador

```
npm ci
npm run dev          # site em http://localhost:8080 e sistema em http://localhost:8080/app/
```

Sem o `firebaseConfig`, o sistema abre em modo demonstração, com dados de exemplo guardados só no navegador.

Para testar login, assinatura e regras de verdade, sem tocar em nenhum banco real:

```
npx firebase-tools emulators:start --only auth,firestore --project demo-lote-certo
npm run build && npx serve dist -l 8080      # em outro terminal
node testes/e2e.js                           # precisa do Playwright instalado
```

O endereço `http://localhost:8080/app/?emulador` usa os emuladores.
