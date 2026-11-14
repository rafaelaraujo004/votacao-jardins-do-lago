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
| Senha da equipe vazada ou fraca | Senha provisória gerada com crypto (cerca de 69 bits), mostrada **uma vez** e nunca gravada; troca obrigatória no 1º acesso (nenhuma página abre e nada grava até trocar); trocar a senha derruba as sessões de todos os aparelhos; mínimo de 10 caracteres | `src/lib/senha.ts`, `src/server/acoes/acesso.ts`, `src/server/contexto.ts` |
| Descobrir quem tem conta | Senha errada e e-mail inexistente dão a mesma mensagem; proteção contra enumeração de e-mail ligada no Firebase | `src/lib/senha.ts` |
| Código de visitante copiado do banco | No banco fica só o HMAC (segredo `PORTARIA_SEGREDO_CODIGO`, obrigatório em produção); código de um dia vale uma vez só | `src/lib/portaria.ts`, `src/server/acoes/portaria.ts` |
| Adivinhar códigos de visitante | Limite de 40 consultas de código por porteiro a cada 5 min; 30 autorizações por casa por hora | `src/server/acoes/portaria.ts` |
| Duas reservas no mesmo horário | Trava por horário + conferência de sobreposição na mesma transação | `src/server/dados/reservas.ts` |

## Pendências conhecidas (planejadas)

- **Login dos moradores**: a decidir (a equipe já entra com e-mail e senha).
- **CSP com nonce** no lugar de `'unsafe-inline'`: Fase 6.
- **Revisão de segurança e testes de concorrência**: Fase 6.

## LGPD

- **Mínimo necessário**: visitante = nome, data, horário e placa (opcional). Nada de CPF/RG por padrão.
- **Retenção proposta** (a confirmar com o síndico): nomes e placas de visitantes anonimizados após **90 dias**; registros de entrada/saída mantidos por **1 ano**; auditoria mantida enquanto houver obrigação de prestação de contas. Hoje a limpeza de 90 dias é feita pelo botão **"Remover nomes antigos agora"** em `/admin/portaria` (função `limparVisitantesAntigos`): o nome vira "Nome removido (LGPD)" e a observação é apagada; o registro continua (para a contagem) e tudo é auditado. Uma tarefa agendada (Vercel Cron) pode chamar a mesma função depois.
- **Separação**: morador nunca vê dados pessoais de outra casa (nas reservas aparece só "Ocupado"); portaria não vê financeiro.
- **E-mail da equipe**: fica só no Firebase Authentication, não no Firestore; na auditoria aparece mascarado (`jo•••@gmail.com`).
- **Finalidade**: dados usados só para a gestão do condomínio; sem analytics, sem anúncios, sem fontes ou scripts de terceiros além do reCAPTCHA.
- **Transparência**: a prestação de contas mostra só informações coletivas aprovadas para divulgação, sem dados bancários ou pessoais.

## Backup e restauração

- **Com plano Blaze**: backups agendados do Firestore (diários, retenção de 7 a 14 dias) e recuperação a um ponto no tempo (PITR).
- **Só gratuito (Spark)**: exportação manual periódica (`gcloud firestore export`) para um bucket — também exige faturamento ativo para o bucket; alternativa é exportar por script com o Admin SDK para arquivos JSON guardados com segurança.
- Decisão do plano: antes da Fase 4. O teste de restauração entra na Fase 6.
