# Perfis e permissões

Fonte única: `src/lib/permissoes.ts`.

## Perfis

| Perfil | Tela inicial | Resumo |
|---|---|---|
| Morador | `/inicio` | Entra com **usuário** (código de 6 caracteres) + senha. Serviços da própria casa; financeiro só o que foi publicado |
| Portaria | `/portaria` | Visitantes, entradas/saídas, encomendas, reservas do dia. **Nunca** financeiro |
| Síndico / Administração (`admin`) | `/admin` | Tudo |
| Conselho (`conselheiro`) | `/admin` | Consulta: financeiro, relatórios, unidades, comunicados, documentos. Sem edição por padrão |
| Responsável pelas reservas (`reservas`) | `/admin/reservas` | Acesso de equipe (e-mail e senha) **só da agenda de reservas**: vê a agenda e aprova/recusa pedidos (`area.gestao`, `reservas.ver_todas`, `reservas.gerenciar`). Nada de financeiro, pessoas ou auditoria. Pode receber como extra `areas.configurar` e `informacoes.ver`. Recebe no sino os pedidos das áreas em que o síndico a marcou como responsável |

## Como a permissão final é calculada

```
permissões = padrão do papel  +  extras concedidas (só as que cabem no "teto" do papel)  −  retiradas
```

- A **retirada sempre vence**.
- O **teto** impede erros graves: por exemplo, a portaria não recebe nada do financeiro, da auditoria nem de permissões, mesmo que alguém tente conceder.
- Os extras e retiradas ficam em `members/{uid}.permissoesExtras` e `permissoesNegadas` (tela de edição na Fase 2, com auditoria `membro.permissoes`).

## Nada abre sem login

Não existe área pública. Todas as páginas, ações e exportações exigem sessão válida; o condomínio vem sempre da sessão (nunca de `?c=` nem de cabeçalho). O proxy (`src/proxy.ts`) faz a triagem: qualquer área sem cookie vai para `/entrar?volta=...`. A área do morador exige `area.morador` no layout e cada página confere a sua permissão (tabela abaixo). O `?c=` só existe em `/entrar`, para montar o login do morador de outro condomínio (ex.: demonstração).

## Onde é aplicada

1. **Páginas**: `exigirPermissao("area.gestao")` no layout de cada área. Sem login → `/entrar`; senha provisória → `/conta/senha`; sem permissão → a **versão do mesmo módulo** no perfil da pessoa (ex.: morador abrindo `/admin/reservas` → `/reservas`), ou `/sem-acesso` se não houver (lista em `src/lib/modulos.ts`). A equipe que abre um link da área do morador (ex.: síndico em `/reservas`) também vai para a sua versão (`/admin/reservas`); telas sem versão na gestão (ex.: `/mapa`) continuam abrindo para quem tem a permissão. O destino sempre exige a permissão da tela; um teste garante que nunca há ida e volta entre duas telas.
2. **Ações e consultas**: `garantirPermissao(ctx, "financeiro.lancar")` no início de cada função de `src/server/`. Com senha provisória, `garantirPermissao` recusa tudo até a pessoa trocar a senha.
3. **Menus**: só mostram o que a pessoa pode usar.
4. **Regras do Firestore**: espelham o essencial (papel, unidade, condomínio, publicado/visível). Gravação direta: negada para todos.

## Permissões por tela (módulos novos)

| Tela | Permissão |
|---|---|
| `/visitas` (morador) | `visitantes.autorizar` (sem login → `/entrar?volta=/visitas`) |
| `/encomendas` (morador) | `encomendas.ver_proprias` (sem login → `/entrar?volta=/encomendas`) |
| `/inicio`, `/mais` (morador) | `area.morador` |
| `/financeiro`, `/relatorio/financeiro`, `/api/financeiro/exportar` | `financeiro.ver_publicado` (só meses publicados) ou `financeiro.ver` (equipe: todos os meses) |
| `/mapa` | `mapa.ver` |
| `/contatos` | `informacoes.ver` |
| `/reservas` (morador) | agenda: `area.morador` (só "Ocupado", sem casas); **pedir e cancelar** reserva: `reservas.fazer` |
| `/admin/informacoes` | `informacoes.gerenciar` (só o admin; a portaria pode receber como extra) |
| `/portaria` | `portaria.operar` (reservas de hoje: `reservas.ver_todas`) |
| `/admin/portaria` | `visitantes.ver_todos`; o botão de limpeza LGPD exige também `moradores.gerenciar` (só o admin) |
| `/admin/reservas` | `reservas.ver_todas` para ver; `reservas.gerenciar` para aprovar, recusar, reservar, bloquear e cancelar |
| `/admin/reservas/areas` | `areas.configurar` (inclui escolher **quem aprova os pedidos** de cada área — só síndico ou responsável pelas reservas ativos — e as fotos da área) |
| Acesso com senha da equipe (página da pessoa) | `equipe.gerenciar` |
| Usuário e senha do morador (página da pessoa e da unidade) | `moradores.gerenciar` (só o admin). **Um login por casa**: se alguém da casa já tem usuário, o portal não cria outro (conferido de novo na transação); "Remover login" (`removerAcessoMorador`) libera a casa para criar em nome de outra pessoa e derruba na hora as sessões abertas da casa (marca `loginRemovido`). Quem tem o login não muda de perfil nem de casa (a família entraria como equipe ou como outra casa): é preciso "Remover login" antes. Suspender quem tem o login bloqueia a casa inteira |
| `/admin/pessoas` (lista) e página da pessoa | `moradores.ver` = consulta; **editar** nome, perfil, casa e telefones: `moradores.gerenciar` (morador) ou `equipe.gerenciar` (portaria, conselho e administração) |
| `/admin/pessoas/importar` (trazer a lista de contatos da votação) | `moradores.gerenciar` (só o admin) |
| **Excluir cadastro** (página da pessoa) | só o **papel admin**, com a gerência do perfil da pessoa; nunca o próprio cadastro nem o último admin ativo. Apaga o cadastro, o usuário do morador e a conta de acesso (não dá para desfazer: para algo temporário use "Suspender") |
| `/comunicados`, `/comunicados/[id]` (morador) | `comunicados.ver` (só publicados) |
| `/admin/comunicados` | `comunicados.ver` = consulta; `comunicados.publicar` = criar, editar, publicar, fixar e arquivar |
| `/solicitacoes`, `/solicitacoes/[id]` (morador) | `solicitacoes.abrir` (só a própria casa; notas internas nunca aparecem) |
| `/admin/solicitacoes` | `solicitacoes.gerenciar` (admin; o conselho pode receber como extra) |
| `/documentos` (morador) | `documentos.ver` (só os ativos e visíveis para o papel) |
| `/admin/documentos` | `documentos.ver` = consulta; `documentos.gerenciar` = cadastrar, editar, desativar |
| `/enquetes`, `/enquetes/[id]` (morador) | `enquetes.votar` (1 voto por casa, sem troca) |
| `/admin/enquetes` | `enquetes.gerenciar` (vê só totais, nunca o voto de cada casa) |
| `/votacao`, `/votacao/[id]` (morador) | `eleicoes.votar` (1 voto por casa, secreto, sem troca) |
| `/admin/votacao`, `/relatorio/votacao/[id]` | `eleicoes.gerenciar` (participação e, só no encerramento, a apuração) |
| `/admin/votacao/[id]/links` | `eleicoes.gerenciar` (contatos, links, senhas e WhatsApp) |
| `/votar/[código]` (público) | sem login: o código do link + a senha de 6 números da casa |
| `/classificados` (morador) | `classificados.usar` (anúncios aprovados: só primeiro nome e o WhatsApp escolhido pelo autor) |
| `/classificados/moderar` (morador com extra) | `classificados.moderar` |
| `/classificados/[id]/editar` | `classificados.usar` + ser o **autor**; só aguardando, publicado ou não aprovado; ao salvar volta para aprovação |
| Notificações no celular (`chavePublicaPush`, `salvarInscricaoPush`, `removerInscricaoPush`) | estar logado; a inscrição fica ligada a quem está logado e só ela mesma remove |
| `/admin/classificados` | `classificados.moderar` (vê a casa do autor) |
| `/admin/relatorios`, `/admin/relatorios/csv` | `relatorios.ver` (o financeiro exige também `financeiro.ver` ou `financeiro.ver_publicado`) |
| PIX da taxa em `/admin/informacoes` | só o papel **admin**, mesmo que outra pessoa tenha `informacoes.gerenciar` (contra golpe) |
| `/conta/senha` | só estar logado (fica fora das áreas, para não entrar em laço) |
| Sino e `/notificacoes`, `/admin/notificacoes`, `/portaria/notificacoes`, `/api/notificacoes` | estar logado; cada item depende da permissão do assunto: anúncios aguardando (`classificados.moderar`), pedidos de reserva (`reservas.gerenciar`, só para o **responsável da área** — ou o síndico, se a área não tiver), solicitações abertas (`solicitacoes.gerenciar`); morador: votação, enquetes, comunicados, documentos e respostas aos pedidos da **própria casa**; portaria: visitas autorizadas (`visitantes.ver_todos`) e comunicados |
| `/portaria/comunicados`, `/portaria/comunicados/[id]` | `comunicados.ver` (só publicados) |
| Enviar fotos (`prepararEnvioFoto`) | anúncio: `classificados.usar`; comunicado: `comunicados.publicar`; área: `areas.configurar`. Autorização de uso único para UM caminho; 40 fotos por pessoa por hora |
| `/api/fotos/{módulo}/{id}/{n}` | anúncio: aprovado e no prazo (`classificados.usar`), do próprio autor ou `classificados.moderar`; comunicado: publicado (`comunicados.ver`) ou `comunicados.publicar`; área: ativa (quem vê a agenda) ou `areas.configurar`. Quem não pode ver recebe "não encontrada" |
| Cancelar (não atender) uma solicitação | `solicitacoes.gerenciar` + **comentário obrigatório e visível para o morador** |

## Testes

- `tests/unit/permissoes.test.ts` — padrão por papel, teto, retirada, valores inválidos.
- `tests/regras/firestore.test.ts` — o que cada perfil consegue ler/gravar direto no banco.
- `tests/integracao/contexto.test.ts` — vínculo suspenso, condomínio suspenso, condomínio que não é da pessoa.
- `tests/integracao/usuario-morador.test.ts` — login do morador no simulador (e-mail sintético, usuário em minúsculas, senha errada, suspenso).
- `tests/integracao/login-por-casa.test.ts` — um login por casa (inclusive dois cliques ao mesmo tempo), remover o login (sessão cai na hora), dono do login não muda de perfil nem de casa.
- `tests/unit/destino-seguro.test.ts` — o `?volta=` só aceita caminhos internos e que combinam com o perfil.
- `tests/integracao/enquetes.test.ts` — 1 voto por casa (inclusive dois ao mesmo tempo), casa inativa, auditoria sem a opção.
- `tests/integracao/eleicoes.test.ts` — votação oficial: 1 voto por casa (inclusive simultâneo), nenhuma cédula guardada, auditoria sem a escolha, publicada imutável.
- `tests/integracao/demo-modulos.test.ts` — os dados de demonstração são lidos certo e o morador só vê o que pode.
