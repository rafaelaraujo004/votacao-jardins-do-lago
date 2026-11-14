# Segurança e LGPD

## Medidas implementadas (Fase 1)

| Ameaça | Proteção | Onde |
|---|---|---|
| Ver dados de outra casa ou outro condomínio | Contexto vem do banco; consultas sempre em `condominiums/{ctx.condominioId}`; regras do Firestore por condomínio e unidade | `src/server/contexto.ts`, `firestore.rules` |
| Gravar direto no banco pelo navegador | Regras negam toda gravação do cliente | `firestore.rules` |
| Apagar ou alterar rastros | Auditoria só com `create`, na mesma transação da alteração; regras negam update/delete | `src/server/auditoria.ts` |
| Roubo de sessão por script | Cookie `httpOnly`, `secure` em produção, revogação conferida | `src/server/sessao.ts` |
| Pedido forjado de outro site (CSRF) | Conferência de origem + Server Actions do Next + `sameSite=lax` | `src/server/seguranca.ts` |
| Força bruta / robôs | Limite de 10 sessões por IP a cada 5 min; App Check (reCAPTCHA) | `src/server/rate-limit.ts`, `app-check.ts` |
| Login de demonstração esquecido em produção | Só existe com simulador **e** fora do build de produção; teste automático garante 404 | `src/server/demo.ts`, `tests/unit/demo.test.ts` |
| Simulador apontado em produção | Admin SDK recusa iniciar com `*_EMULATOR_HOST` na Vercel de produção | `src/server/firebase-admin.ts` |
| Site dentro de iframe, scripts de terceiros | CSP, `frame-ancestors 'none'`, HSTS, `nosniff`, Permissions-Policy | `next.config.ts` |
| Credenciais no código | Tudo em variáveis de ambiente; `.env*` no `.gitignore` | `.env.example` |
| Dados de entrada malformados | Validação com zod antes de usar | `src/lib/validacao.ts` |
| Contas criadas por qualquer um | Não há cadastro público; vínculo só pelo admin ou script | `scripts/criar-condominio.ts` |

## Pendências conhecidas (planejadas)

- **Método de login real**: a decidir antes da Fase 2.
- **CSP com nonce** no lugar de `'unsafe-inline'`: Fase 6.
- **Revisão de segurança e testes de concorrência**: Fase 6.

## LGPD

- **Mínimo necessário**: visitante = nome, data, horário e placa (opcional). Nada de CPF/RG por padrão.
- **Retenção proposta** (a confirmar com o síndico): nomes e placas de visitantes anonimizados após **90 dias**; registros de entrada/saída mantidos por **1 ano**; auditoria mantida enquanto houver obrigação de prestação de contas. Limpeza automática por tarefa agendada (Vercel Cron) na Fase 3.
- **Separação**: morador nunca vê dados pessoais de outra casa; portaria não vê financeiro.
- **Finalidade**: dados usados só para a gestão do condomínio; sem analytics, sem anúncios, sem fontes ou scripts de terceiros além do reCAPTCHA.
- **Transparência**: a prestação de contas mostra só informações coletivas aprovadas para divulgação, sem dados bancários ou pessoais.

## Backup e restauração

- **Com plano Blaze**: backups agendados do Firestore (diários, retenção de 7 a 14 dias) e recuperação a um ponto no tempo (PITR).
- **Só gratuito (Spark)**: exportação manual periódica (`gcloud firestore export`) para um bucket — também exige faturamento ativo para o bucket; alternativa é exportar por script com o Admin SDK para arquivos JSON guardados com segurança.
- Decisão do plano: antes da Fase 4. O teste de restauração entra na Fase 6.
