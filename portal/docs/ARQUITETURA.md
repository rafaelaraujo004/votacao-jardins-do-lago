# Arquitetura

## Visão geral

```
Celular / computador ──► Next.js (Vercel) ──────────────► Firebase
   telas                 servidor: confere quem é você,    Authentication (contas)
                         seu condomínio, sua permissão,    Firestore (dados)
                         valida os dados e grava com       App Check (anti-robô)
                         auditoria
```

- **O navegador só prova quem é a pessoa** (Firebase Authentication) e troca isso por um cookie de sessão seguro (`POST /api/sessao`).
- **O servidor faz todo o resto.** Páginas (Server Components) e ações (Server Actions / Route Handlers) começam sempre por `getContexto()` em `src/server/contexto.ts`.
- **As regras do Firestore são a segunda barreira**: mesmo que alguém use o Firebase direto do navegador, não grava nada e só lê o que é seu.

## Pastas

```
portal/
  src/app/                 telas e rotas
    (publico)/entrar/        entrada (botões de demonstração só no local)
    (morador)/inicio/        início do morador
    (portaria)/portaria/     tela de trabalho da portaria
    (gestao)/admin/          painel do síndico e do conselho (+ /admin/auditoria)
    identidade/              vitrine do visual (só local)
    api/sessao/              cria a sessão
    api/demo/entrar/         login de demonstração (404 fora do simulador)
  src/components/ui/       peças visuais reutilizáveis
  src/components/layout/   faixa do topo e menus
  src/lib/                 código que pode rodar em qualquer lugar (permissões, formatos, validação)
  src/server/              código SÓ do servidor (Admin SDK, contexto, sessão, auditoria)
  src/proxy.ts             triagem rápida: sem cookie → /entrar
  firestore.rules          regras do banco
  scripts/                 simulador, dados de demonstração, criação do condomínio
  tests/                   unit/, regras/, integracao/
```

`(publico)`, `(morador)` etc. são **grupos**: organizam as pastas sem aparecer no endereço.

## Decisões técnicas

| Decisão | Por quê |
|---|---|
| Next.js com App Router e Server Components | A página já sai do servidor com os dados certos para aquela pessoa; o navegador recebe menos código. |
| Gravações só pelo servidor (Admin SDK) | Validação, permissão e auditoria ficam num lugar só, que o usuário não controla. |
| Admin SDK só em `src/server/` com `import "server-only"` | O Admin SDK ignora as regras do Firestore. Se alguém tentar usá-lo numa tela do navegador, o build falha. |
| Funções de dados recebem o `Contexto` (ex.: `resumoDoCondominio(ctx)`) | Impossível consultar outro condomínio por engano: o id vem do contexto. |
| Sessão por cookie `httpOnly` (5 dias) | O JavaScript da página não lê o cookie; o servidor pode revogar. |
| `sameSite=lax` (e não `strict`) | Quem abre um link do portal pelo WhatsApp chega logado. Pedidos forjados são barrados pela checagem de origem e pelas Server Actions. |
| Cache de componentes do Next desligado | Quase todas as telas mudam por pessoa logada; mantém o comportamento simples e previsível. |
| Sem banco adicional | O Firestore atende 220 casas com folga. Totais (financeiro) ficarão em documentos de resumo mensal atualizados em transação. |
| Dinheiro em centavos inteiros | Evita erros de arredondamento (0,1 + 0,2 ≠ 0,3 em ponto flutuante). |
| Datas sempre por `src/lib/formato.ts` com `America/Belem` | A Vercel roda em UTC; às 22h em Belém já é o dia seguinte em UTC. |
| Limite de tentativas no próprio Firestore | Evita contratar outro serviço; documentos expiram sozinhos (TTL). |
| CSP com `'unsafe-inline'` em scripts | O Next injeta scripts próprios. Trocar por "nonce" está previsto na Fase 6. |

## Identidade visual

Continuação do "Visual Jardim" da votação. Tokens em `src/app/globals.css` (claro e escuro) viram classes do Tailwind (`bg-pine`, `text-ink`, `border-line`...).

| Papel | Cor | Uso |
|---|---|---|
| Verde-pinho | `#1D6B4E` | Institucional, botões principais |
| Verde-noite | `#12382A` | Faixa do topo, menu |
| Azul-lago | `#1C5C78` | Informação, links |
| Ameixa | `#8B2A5C` | Destaques (cor do nome na logo) |
| Areia | `#E9DFC4` | Etiquetas (dourado da logo) |

- Fontes locais: **Atkinson Hyperlegible** (texto, feita para baixa visão) e **Bricolage Grotesque** (títulos). Licença SIL OFL em `src/app/fonts/LICENCA.txt`.
- Texto base 17px, botões com 48px+ de altura, foco visível, animações respeitam "reduzir movimento".
- Status sempre com **ícone + texto**, nunca só cor.
- Itens ainda não construídos aparecem esmaecidos com "Em breve · Fase N" e **não são clicáveis**.

Peças: `Botao`, `BotaoLink`, `Cartao`, `Alerta`, `Etiqueta`, `EstadoVazio`, `Campo`, `TituloPagina`, `Atalho`, `BotaoComConfirmacao`, `useAvisos` (avisos rápidos), `BotaoTema`, `Logo`, `Petalas`.

## Navegação

- **Morador** (celular primeiro): faixa verde com nome e casa; 9 atalhos grandes na ordem Financeiro, Visitantes, Reservas, Mapa, Encomendas, Comunicados, Informar um problema, Documentos, Contatos; barra inferior Início · Visitantes · Reservas · Mais (no computador vira coluna).
- **Portaria** (tablet/computador): uma tela de trabalho com buscar, validar código, entrada/saída, nova encomenda e listas do dia.
- **Gestão** (síndico e conselho): menu lateral em grupos, filtrado pelas permissões. Conselho vê "Somente consulta".
