# Lote Certo (versão comercial)

Sistema de controle de gado de corte por lote, vendido por assinatura. É um projeto **separado** do sistema
pessoal da Fazenda São João, que continua intacto na raiz deste repositório.

O que tem aqui:

| Pasta | O que é |
|---|---|
| `site/` | Site de vendas. Vai para a raiz do endereço. |
| `src/`, `public/` | O sistema. Vai para `/app/`. Funciona sem internet. |
| `firestore.rules` | Regras de acesso do banco. |
| `testes/` | Testes automáticos: `fluxo-demo.js` (todas as áreas, sem banco) e `e2e.js` (login, assinatura e regras, com emuladores). |

## Áreas do sistema

Segue o documento de requisitos funcionais. Cada área é um arquivo `src/telas-*.js`; as contas ficam todas em `src/calc.js`.

| Área | O que faz |
|---|---|
| Painel | Cabeças, custo do dia da fazenda, peso médio estimado, GMD, pastos e avisos de pesagem atrasada. |
| Lotes | Entrada (com custo por kg, comissão, frete, pasto, trato e GMD estimado) e lotes ativos com custo por dia. |
| Manejo de pasto | Disposição dos lotes, mudança de pasto e cadastro de pastos com custo por hectare por ano. |
| Pesagem e apartação | Balança contra peso estimado, ajuste do GMD estimado e lotes derivados que herdam os custos. |
| Sanidade | Protocolo, tratamento e catálogo de medicamentos. |
| Trato | Trato do dia por lote e por ingrediente, troca de dieta, dietas com versões e ingredientes. |
| Custos fixos e gerais | Custo fixo mensal e custo geral diluído em meses, rateados por cabeça por dia. |
| Saída | Abate ou venda viva, com fechamento do lote: custos, arrobas, receita, custo por dia e resultado. |

Regras que valem para tudo:

- **Preço com vigência**: medicamento, ingrediente, dieta e pasto guardam o histórico de preços com a data de início.
  O custo de cada dia usa o preço que valia naquele dia. Preço novo nunca muda o passado.
- **Medido vence estimado**: entre pesagens o peso cresce pelo GMD estimado; a balança passa a valer quando lançada.
- **Custo do lote** = aquisição + pasto + trato + sanidade + custos fixos + custos gerais, somados dia a dia.

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

1. O projeto Firebase é o `lote-certo-2ec77`. A publicação é automática pelo GitHub Actions (`.github/workflows/publicar-lote-certo.yml`) sempre que uma mudança em `comercial/` entra no ramo `main`, com os segredos `LOTE_CERTO_SERVICE_ACCOUNT` e `LOTE_CERTO_ADMIN_EMAIL`. Os passos abaixo são para fazer à mão.
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

O endereço `http://localhost:8080/app/?demo` abre o modo demonstração, com dados de exemplo guardados só no navegador
(também é o que abre quando o `firebaseConfig` está vazio). Para testar todas as áreas nesse modo:

```
node testes/fluxo-demo.js                    # com o npm run dev ligado; precisa do Playwright instalado
```

Para testar login, assinatura e regras de verdade, sem tocar em nenhum banco real:

```
npx firebase-tools emulators:start --only auth,firestore --project demo-lote-certo
npm run build && npx serve dist -l 8080      # em outro terminal
node testes/e2e.js                           # precisa do Playwright instalado
```

O endereço `http://localhost:8080/app/?emulador` usa os emuladores.
