# Perfis e permissões

Fonte única: `src/lib/permissoes.ts`.

## Perfis

| Perfil | Tela inicial | Resumo |
|---|---|---|
| Morador | `/inicio` | Entra com **usuário** (código de 6 caracteres) + senha. Serviços da própria casa; financeiro só o que foi publicado |
| Portaria | `/portaria` | Visitantes, entradas/saídas, encomendas, reservas do dia. **Nunca** financeiro |
| Síndico / Administração (`admin`) | `/admin` | Tudo |
| Conselho (`conselheiro`) | `/admin` | Consulta: financeiro, relatórios, unidades. Sem edição por padrão |

## Como a permissão final é calculada

```
permissões = padrão do papel  +  extras concedidas (só as que cabem no "teto" do papel)  −  retiradas
```

- A **retirada sempre vence**.
- O **teto** impede erros graves: por exemplo, a portaria não recebe nada do financeiro, da auditoria nem de permissões, mesmo que alguém tente conceder.
- Os extras e retiradas ficam em `members/{uid}.permissoesExtras` e `permissoesNegadas` (tela de edição na Fase 2, com auditoria `membro.permissoes`).

## Área pública (sem login)

Com `portalPublico: true` no condomínio, qualquer pessoa com o link vê as **informações gerais**, sem permissão nenhuma: `/inicio`, `/financeiro` (só meses publicados), `/mapa`, `/contatos`, `/mais`, a agenda de `/reservas` (só "Ocupado", sem casas) e `/relatorio/financeiro` (só publicado). O que é da casa continua exigindo login e permissão (tabela abaixo). O proxy (`src/proxy.ts`) só faz a triagem: rotas privadas sem cookie vão para `/entrar?volta=...`.

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
| `/reservas` (morador) | agenda: pública; **pedir e cancelar** reserva: `reservas.fazer` (sem login: botão "Entrar para pedir reserva") |
| `/admin/informacoes` | `informacoes.gerenciar` (só o admin; a portaria pode receber como extra) |
| `/portaria` | `portaria.operar` (reservas de hoje: `reservas.ver_todas`) |
| `/admin/portaria` | `visitantes.ver_todos`; o botão de limpeza LGPD exige também `moradores.gerenciar` (só o admin) |
| `/admin/reservas` | `reservas.ver_todas` para ver; `reservas.gerenciar` para aprovar, recusar, reservar, bloquear e cancelar |
| `/admin/reservas/areas` | `areas.configurar` |
| Acesso com senha da equipe (página da pessoa) | `equipe.gerenciar` |
| Usuário e senha do morador (página da pessoa e da unidade) | `moradores.gerenciar` (só o admin) |
| `/conta/senha` | só estar logado (fica fora das áreas, para não entrar em laço) |

## Testes

- `tests/unit/permissoes.test.ts` — padrão por papel, teto, retirada, valores inválidos.
- `tests/regras/firestore.test.ts` — o que cada perfil consegue ler/gravar direto no banco.
- `tests/integracao/contexto.test.ts` — vínculo suspenso, condomínio suspenso, condomínio que não é da pessoa.
- `tests/integracao/usuario-morador.test.ts` — login do morador no simulador (e-mail sintético, usuário em minúsculas, senha errada, suspenso).
- `tests/unit/destino-seguro.test.ts` — o `?volta=` só aceita caminhos internos e que combinam com o perfil.
