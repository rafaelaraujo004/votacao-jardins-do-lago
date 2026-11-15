# Perfis e permissões

Fonte única: `src/lib/permissoes.ts`.

## Perfis

| Perfil | Tela inicial | Resumo |
|---|---|---|
| Morador | `/inicio` | Entra com **usuário** (código de 6 caracteres) + senha. Serviços da própria casa; financeiro só o que foi publicado |
| Portaria | `/portaria` | Visitantes, entradas/saídas, encomendas, reservas do dia. **Nunca** financeiro |
| Síndico / Administração (`admin`) | `/admin` | Tudo |
| Conselho (`conselheiro`) | `/admin` | Consulta: financeiro, relatórios, unidades, comunicados, documentos. Sem edição por padrão |

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

1. **Páginas**: `exigirPermissao("area.gestao")` no layout de cada área. Sem login → `/entrar`; senha provisória → `/conta/senha`; sem permissão → `/sem-acesso`.
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
| `/admin/reservas/areas` | `areas.configurar` |
| Acesso com senha da equipe (página da pessoa) | `equipe.gerenciar` |
| Usuário e senha do morador (página da pessoa e da unidade) | `moradores.gerenciar` (só o admin) |
| `/comunicados`, `/comunicados/[id]` (morador) | `comunicados.ver` (só publicados) |
| `/admin/comunicados` | `comunicados.ver` = consulta; `comunicados.publicar` = criar, editar, publicar, fixar e arquivar |
| `/solicitacoes`, `/solicitacoes/[id]` (morador) | `solicitacoes.abrir` (só a própria casa; notas internas nunca aparecem) |
| `/admin/solicitacoes` | `solicitacoes.gerenciar` (admin; o conselho pode receber como extra) |
| `/documentos` (morador) | `documentos.ver` (só os ativos e visíveis para o papel) |
| `/admin/documentos` | `documentos.ver` = consulta; `documentos.gerenciar` = cadastrar, editar, desativar |
| `/enquetes`, `/enquetes/[id]` (morador) | `enquetes.votar` (1 voto por casa, sem troca) |
| `/admin/enquetes` | `enquetes.gerenciar` (vê só totais, nunca o voto de cada casa) |
| `/classificados` (morador) | `classificados.usar` (anúncios aprovados: só primeiro nome e o WhatsApp escolhido pelo autor) |
| `/classificados/moderar` (morador com extra) | `classificados.moderar` |
| `/admin/classificados` | `classificados.moderar` (vê a casa do autor) |
| `/admin/relatorios`, `/admin/relatorios/csv` | `relatorios.ver` (o financeiro exige também `financeiro.ver` ou `financeiro.ver_publicado`) |
| PIX da taxa em `/admin/informacoes` | só o papel **admin**, mesmo que outra pessoa tenha `informacoes.gerenciar` (contra golpe) |
| `/conta/senha` | só estar logado (fica fora das áreas, para não entrar em laço) |

## Testes

- `tests/unit/permissoes.test.ts` — padrão por papel, teto, retirada, valores inválidos.
- `tests/regras/firestore.test.ts` — o que cada perfil consegue ler/gravar direto no banco.
- `tests/integracao/contexto.test.ts` — vínculo suspenso, condomínio suspenso, condomínio que não é da pessoa.
- `tests/integracao/usuario-morador.test.ts` — login do morador no simulador (e-mail sintético, usuário em minúsculas, senha errada, suspenso).
- `tests/unit/destino-seguro.test.ts` — o `?volta=` só aceita caminhos internos e que combinam com o perfil.
- `tests/integracao/enquetes.test.ts` — 1 voto por casa (inclusive dois ao mesmo tempo), casa inativa, auditoria sem a opção.
- `tests/integracao/demo-modulos.test.ts` — os dados de demonstração são lidos certo e o morador só vê o que pode.
