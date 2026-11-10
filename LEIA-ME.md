# Gado · Fazenda São João

Sistema para controlar os lotes de gado da Fazenda São João: entrada, lotes ativos, saída,
sanidade, pesagem com GMD automático e uma planilha Excel com tudo.

Funciona no celular e no computador, **inclusive sem internet**: o que for lançado sem
conexão fica guardado no aparelho e sobe sozinho para a nuvem quando a internet volta.

## Como funciona

| Parte | O que faz |
|---|---|
| Site (GitHub Pages) | As telas do sistema. Pode ser instalado no celular como um app. |
| Firebase Firestore | O banco de dados na nuvem. Guarda uma cópia no aparelho para funcionar sem internet. |
| Login com Google | Só as contas autorizadas nas regras do banco conseguem ver e lançar dados. |
| Botão "Baixar planilha Excel" | Gera um `.xlsx` com as abas Resumo, Lotes, Entradas, Saídas, Pesagens e Sanidade. |

As contas usadas (GitHub e Firebase no plano Spark) são gratuitas para o tamanho de uma fazenda.

## Configuração (uma vez só)

1. **Firebase**: criar o projeto, ativar o login com Google e o Firestore (região `southamerica-east1`).
2. Registrar um app **Web** no projeto e colar o bloco `firebaseConfig` em `src/firebase-config.js`.
3. Em **Firestore → Regras**, colar o conteúdo de `firestore.rules`, trocando `SEU_EMAIL@gmail.com`
   pelo e-mail da conta Google que vai usar o sistema, e clicar em **Publicar**.
4. Em **Authentication → Configurações → Domínios autorizados**, adicionar `felpz016.github.io`.
5. No GitHub, em **Settings → Pages**, deixar **Source: GitHub Actions**. Cada envio para a
   branch `main` publica o site em `https://felpz016.github.io/sistema-gado/`.

## Instalar no celular

Abra o endereço do site no celular, entre com a conta Google e:
- **Android (Chrome)**: menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari)**: botão Compartilhar → **Adicionar à Tela de Início**.

O primeiro acesso em cada aparelho precisa de internet (para o login e para baixar os dados).
Depois disso o app abre e grava sem conexão.

## Regras do sistema

- **GMD** = (peso médio novo − peso anterior) ÷ dias entre as datas. O peso anterior é o da última
  pesagem ou, na primeira, o peso de entrada.
- **Peso atual** de um lote = última pesagem (ou o peso de entrada, se ainda não foi pesado).
- **Peso médio do rebanho** = soma de (peso atual × cabeças) dos lotes ativos ÷ total de cabeças.
- **Saída** é do lote inteiro. O lote sai de "Lotes ativos" e fica no histórico. Dá para desfazer.
- No histórico de cada lote dá para corrigir os dados de entrada e excluir pesagens ou manejos lançados errado.

## Para quem for mexer no código

```bash
npm install
npm run dev          # http://localhost:8080 (sem configuração do Firebase abre em modo demonstração)
npm run build        # gera a pasta dist/
```

Teste com os emuladores do Firebase: `npx firebase-tools emulators:start --only firestore,auth --project demo-gado`
(Firestore na porta 8085, Auth na 9099) e abra `http://localhost:8080/?emulador`.
