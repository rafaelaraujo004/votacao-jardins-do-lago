# Perfis e permissões

Fonte única: `src/lib/permissoes.ts`.

## Perfis

| Perfil | Tela inicial | Resumo |
|---|---|---|
| Morador | `/inicio` | Serviços da própria casa; financeiro só o que foi publicado |
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

## Onde é aplicada

1. **Páginas**: `exigirPermissao("area.gestao")` no layout de cada área. Sem login → `/entrar`; senha provisória → `/conta/senha`; sem permissão → `/sem-acesso`.
2. **Ações e consultas**: `garantirPermissao(ctx, "financeiro.lancar")` no início de cada função de `src/server/`. Com senha provisória, `garantirPermissao` recusa tudo até a pessoa trocar a senha.
3. **Menus**: só mostram o que a pessoa pode usar.
4. **Regras do Firestore**: espelham o essencial (papel, unidade, condomínio, publicado/visível). Gravação direta: negada para todos.

## Permissões por tela (módulos novos)

| Tela | Permissão |
|---|---|
| `/visitas` (morador) | `visitantes.autorizar` |
| `/encomendas` (morador) | `encomendas.ver_proprias` |
| `/reservas` (morador) | `reservas.fazer` |
| `/portaria` | `portaria.operar` (reservas de hoje: `reservas.ver_todas`) |
| `/admin/portaria` | `visitantes.ver_todos`; o botão de limpeza LGPD exige também `moradores.gerenciar` (só o admin) |
| `/admin/reservas` | `reservas.ver_todas` para ver; `reservas.gerenciar` para aprovar, recusar, reservar, bloquear e cancelar |
| `/admin/reservas/areas` | `areas.configurar` |
| Acesso com senha da equipe (página da pessoa) | `equipe.gerenciar` |
| `/conta/senha` | só estar logado (fica fora das áreas, para não entrar em laço) |

## Testes

- `tests/unit/permissoes.test.ts` — padrão por papel, teto, retirada, valores inválidos.
- `tests/regras/firestore.test.ts` — o que cada perfil consegue ler/gravar direto no banco.
- `tests/integracao/contexto.test.ts` — vínculo suspenso, condomínio suspenso, condomínio que não é da pessoa.
