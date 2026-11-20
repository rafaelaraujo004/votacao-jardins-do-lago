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
    (gestao)/admin/          painel do síndico e do conselho (+ /admin/auditoria, /admin/links)
    (atalhos)/               links curtos que só encaminham: /sindico, /conselho, /morador
    identidade/              vitrine do visual (só local)
    api/sessao/              cria a sessão
    api/demo/entrar/         login de demonstração (404 fora do simulador)
    api/sinais/              "o que mudou?" para as telas se atualizarem sozinhas
    api/notificacoes/        a lista do sino de quem está logado
    api/fotos/               entrega cada foto (anúncio, comunicado, área) só para quem pode ver
  src/components/ui/       peças visuais reutilizáveis
  src/components/layout/   faixa do topo e menus
  src/lib/                 código que pode rodar em qualquer lugar (permissões, formatos, validação)
  src/server/              código SÓ do servidor (Admin SDK, contexto, sessão, auditoria)
  src/proxy.ts             triagem rápida: todas as áreas sem cookie → /entrar?volta=...;
                           com cookie, anota o caminho pedido (x-portal-caminho) para o servidor
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

- **Morador** (celular primeiro): área **sempre com login** (o layout exige `area.morador`; cada página confere de novo) com faixa verde e **"Casa 12 · Sair"** no topo; o condomínio vem sempre da sessão, nunca da URL; barra inferior com 5 itens: Início · Contas · Agenda · Pedidos (solicitações) · Mais (no computador vira coluna, com o bloco da casa: Autorizar visita e Encomendas). Mapa, Contatos, Comunicados, Documentos, Enquetes, Classificados, Visitas e Encomendas ficam em **Mais** e nos atalhos do Início (filtrados pelas permissões). O Início mostra, logo abaixo da ilustração, a **prestação de contas** do último mês publicado (saldo, entradas, saídas e o gráfico do saldo dos últimos meses — no celular um cartão compacto que cabe na primeira tela, `src/components/financeiro/resumo-inicio.tsx`; no computador o mesmo bloco do painel do síndico), depois os comunicados recentes, a enquete aberta, as solicitações da casa, o PIX da taxa, a ronda e o atalho da votação oficial (quando houver link). `/entrar` tem as abas "Sou morador" (usuário + senha) e "Sou da equipe" (e-mail + senha).
- **Portaria** (tablet/computador): uma tela de trabalho com buscar, validar código, entrada/saída, nova encomenda e listas do dia. O sino do topo mostra as visitas autorizadas pelos moradores e os comunicados (lidos em `/portaria/comunicados`).
- **Sino de notificações** no topo das três áreas (veja "Sino de notificações" abaixo) e o rodapé "Desenvolvido por Rafael Araújo" nas telas principais (`src/components/ui/assinatura.tsx`).
- **Gestão** (síndico e conselho): menu lateral em grupos, filtrado pelas permissões (Pessoas, Portaria, Finanças com Relatórios, Serviços com Reservas e Solicitações, Comunicação com Comunicados, Documentos, Enquetes e Classificados, Configurações → Informações do condomínio, Auditoria). O painel `/admin` mostra as pendências (solicitações abertas, reservas pendentes, anúncios para aprovar) e os atalhos. Conselho vê "Somente consulta".

## Links por módulo

Cada módulo tem um link curto, o mesmo para todo mundo. "Síndico e conselho" depende das permissões: o conselho só vê o que o perfil dele permite (o resto vai para "sem acesso") (lista única em `src/lib/modulos.ts`; o síndico copia e manda pelo WhatsApp em **Configurações → Links de acesso**, `/admin/links`):

| Link | Morador | Portaria | Síndico e conselho |
|---|---|---|---|
| `/sindico`, `/conselho` | — (sem acesso) | — (sem acesso) | `/admin` |
| `/portaria` | `/visitas` | `/portaria` | síndico: `/portaria` (pode operar) · conselho: sem acesso |
| `/morador` | `/inicio` | `/portaria` | `/admin` |
| `/reservas` | `/reservas` | `/portaria` | `/admin/reservas` |
| `/visitas`, `/encomendas` | a própria tela | `/portaria` | `/admin/portaria` (síndico) |
| `/financeiro` | `/financeiro` | — | `/admin/financeiro` |
| `/comunicados`, `/solicitacoes`, `/documentos`, `/enquetes`, `/classificados` | a própria tela | — | `/admin/<módulo>` (se o perfil puder) |
| `/mapa` | `/mapa` | — | `/mapa` (síndico) |
| `/contatos` | `/contatos` | — | `/admin/informacoes` (síndico) |

- Sem login, o proxy manda para `/entrar?volta=<link>`; a tela de entrada diz "Entre para abrir: Reservas" e já marca a aba certa (equipe para `/sindico`, `/conselho`, `/portaria`). Depois do login, a pessoa segue para a versão do módulo do perfil dela.
- Já logado: o servidor (`exigirPermissao` e `exigirAreaDoMorador` em `src/server/contexto.ts`) faz o mesmo encaminhamento. O destino sempre exige a permissão da tela.
- O `?c=` do link (só fora do condomínio padrão, ex.: a demonstração) vai junto para a tela de entrada, apenas para montar o login do morador.

## Sincronização entre as telas

O que uma pessoa faz aparece sozinho para as outras, em poucos segundos, sem ninguém recarregar a página:

1. Toda alteração já grava a **auditoria** na mesma transação (`registrarAuditoria`). Junto, ela marca "o módulo X mudou agora" em `condominiums/{c}/sistema/sinais` (`src/server/sinais.ts`; a lista ação → módulo está em `src/lib/sincronizacao.ts` e o TypeScript obriga a incluir toda ação nova).
2. As molduras das três áreas têm o componente `<Sincronizar>` (`src/components/layout/sincronizar.tsx`): com a tela visível, pergunta `GET /api/sinais` a cada 20 s (portaria: 15 s) e logo que a pessoa volta para a aba.
3. Mudou um módulo que a tela mostra → `router.refresh()` (busca só os dados novos, sem piscar a página). Mudou outro módulo → atualiza quando a pessoa for até aquela tela.
4. Não atualiza enquanto a pessoa digita ou está com uma janela de confirmação aberta; espera ela terminar. Por segurança, atualiza também a cada 30 min (portaria: 10 min), por causa da virada do dia.

Custo: cada pergunta lê **um** documento (o servidor guarda por 2 min o condomínio de cada pessoa). Isso cabe com folga no plano gratuito (Spark), ao contrário de recarregar a tela inteira de tempo em tempo.

Quando um módulo muda, o `<Sincronizar>` também dispara o evento `portal:sinais` na janela (com a lista de módulos); o sino escuta esse evento para se atualizar em qualquer tela.

## Fotos (classificados, comunicados e áreas de lazer)

Regras puras em `src/lib/fotos.ts`; servidor em `src/server/fotos.ts` e `src/server/acoes/fotos.ts`; telas em `src/components/fotos/`.

1. **No celular**, cada foto é reduzida (lado maior de 1600 px) e regravada em JPEG (`src/lib/foto-navegador.ts`). Fica leve e os dados escondidos da foto (como a **localização GPS**) ficam para trás.
2. O servidor dá uma **autorização de uso único** (token com `envioFoto` = caminho exato `condominiums/{c}/{classifieds|announcements|amenities}/{uuid}/foto.jpg`). As regras do Storage só deixam **criar** aquele arquivo, imagem de até 5 MB. Até 4 fotos por item; a primeira é a capa/miniatura.
3. Ao salvar, o servidor confere cada foto no Storage (existe, tipo, tamanho, pasta do condomínio) e grava `fotos[{caminho,tipo,tamanho}]` no documento. Na edição, o formulário manda `atual:N` para as fotos que ficam (o caminho interno não vai ao navegador); as que saíram são apagadas do Storage depois de salvar.
4. **Ninguém lê o Storage direto**: a tela usa `/api/fotos/{módulo}/{id}/{n}?v=...`, que confere login e se a pessoa pode ver o item (anúncio aprovado ou do autor; comunicado publicado; área ativa) e entrega um link temporário de 10 minutos (no simulador, o próprio portal entrega a foto). O `?v=` muda quando a foto é trocada. Por isso a CSP permite imagens de `https://storage.googleapis.com`.

## Sino de notificações

Regras puras em `src/lib/notificacoes.ts` (testadas em `tests/unit/notificacoes.test.ts`); dados em `src/server/dados/notificacoes.ts`; tela em `src/components/notificacoes/`.

- O portal **não grava uma notificação por casa**: a lista é montada na hora a partir do que já existe, só com o que o perfil pode ver. Cada pessoa guarda só a hora em que abriu o sino (`condominiums/{c}/sino/{uid}`); o que aconteceu depois aparece como **"Novo"**.
- **Gestão**: anúncios aguardando aprovação, pedidos de reserva (cada pedido vai para o **responsável da área**; área sem responsável → síndico) e solicitações abertas. Esses itens "precisam de você" e contam no número do sino até serem resolvidos.
- **Morador**: votação oficial marcada/aberta (diz se a casa já votou), enquetes abertas que a casa não respondeu (contam até responder), comunicados e documentos dos últimos 30 dias e as respostas aos pedidos da casa (anúncio aprovado/não aprovado/removido com o motivo, reserva confirmada/recusada, solicitação respondida — campo `respondidoEm`).
- **Portaria**: visitas autorizadas que ainda valem e comunicados.
- O sino busca `/api/notificacoes` ao abrir a tela, ao ser tocado e quando o `<Sincronizar>` avisa que um módulo do sino mudou. Lista completa em `/notificacoes`, `/admin/notificacoes` e `/portaria/notificacoes`.

## Notificações no celular e instalar o app

Regras puras em `src/lib/push.ts`; servidor em `src/server/push.ts` e `src/server/acoes/push.ts`; tela em `src/components/app/ativar-app.tsx`; service worker em `public/sw.js`.

- **Ao entrar** (morador, gestão e portaria), uma janela pede para **permitir as notificações** e mostra como **instalar o app** (no Android/Chrome/Edge, o botão usa o pedido de instalação do navegador; no iPhone, explica "Compartilhar → Adicionar à Tela de Início" — lá as notificações só funcionam com o app instalado). Volta em toda sessão até as duas coisas estarem feitas; "Agora não" esconde até a próxima entrada. O sino também tem o botão "Receber no celular".
- Ao permitir, o navegador cria a inscrição do aparelho (serviço do Google, Mozilla ou Apple) e o portal guarda em `condominiums/{c}/pushInscricoes/{hash}` com o `uid` de quem está logado. Já permitido: a inscrição é atualizada em silêncio a cada entrada. **Ao sair**, a tela de entrada cancela a inscrição do aparelho (celular dividido não recebe avisos da conta de outra pessoa).
- As **chaves VAPID** (a assinatura do portal) são criadas sozinhas na primeira vez e guardadas em `config/webpush` (só o servidor; nenhuma variável de ambiente nova).
- **Quando chega** (o envio roda depois de responder à pessoa, com `after`, e nunca derruba a ação):
  - comunicado publicado → moradores e portaria;
  - anúncio enviado ou editado → quem modera; anúncio aprovado, não aprovado ou removido → o autor;
  - pedido de reserva → o responsável pela área (ou o síndico); reserva confirmada ou recusada → a casa;
  - solicitação aberta → quem atende; mudança de situação ou resposta pública → a casa;
  - visita autorizada → portaria;
  - enquete publicada e votação oficial publicada → moradores.
- Inscrição que o serviço diz não existir mais (404/410) é apagada no envio.

## Responsável pelas reservas

- Perfil de equipe **`reservas`** ("Responsável pelas reservas"): entra com e-mail e senha e cai direto em `/admin/reservas` (sem o painel geral). Só vê a agenda e aprova/recusa pedidos.
- Em **Configurar áreas**, o síndico escolhe **"Quem aprova os pedidos"** de cada área (síndico ou uma pessoa com perfil `reservas` ativa). Os pedidos daquela área vão para o sino dessa pessoa; na agenda aparece "Quem aprova: Shirley (você)". Se a pessoa for suspensa, os pedidos voltam a ir para o síndico.
- Recusar um pedido (reserva, anúncio) exige um comentário para o morador; cancelar (não atender) uma solicitação também exige comentário, sempre visível para o morador.

## Editar anúncio (classificados)

O autor edita o próprio anúncio enquanto ele está aguardando, publicado ou não aprovado (`/classificados/{id}/editar`, botão em "Meus anúncios"). Ao salvar, o anúncio **sempre volta para "aguardando aprovação"** (sai do ar se estava publicado) e quem modera recebe o aviso — assim ninguém troca o texto de um anúncio já aprovado. Removido ou expirado não edita (cria outro).
