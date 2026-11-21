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
| Login do morador | **Usuário** = código de 6 caracteres sorteado com crypto (32 símbolos, ~1 bilhão de combinações) + **senha provisória** (a mesma da equipe), vista **uma vez** pelo síndico e nunca gravada nem logada; troca obrigatória no 1º acesso. Usuário inexistente, fora do formato e senha errada dão **a mesma mensagem**. Só o admin (`moradores.gerenciar`) gera; morador suspenso não entra (o contexto barra). Limite de tentativas do Firebase + `/api/sessao` (10 por IP a cada 5 min) | `src/lib/usuario-morador.ts`, `src/server/acoes/acesso.ts`, `src/app/(publico)/entrar` |
| E-mail sintético do morador | O Firebase Auth só aceita e-mail: `K7M4PX` vira `k7m4px@morador.<condominio>.portal.invalid`. O domínio `.invalid` é reservado (RFC 2606): **nunca existe**, então nada é enviado para lá e ninguém pode registrá-lo. Esse e-mail nunca aparece na tela (mostramos o usuário) e a equipe não pode usá-lo | `src/lib/usuario-morador.ts` |
| Mandar a pessoa para um site falso depois do login (`?volta=`) | Só caminhos internos de uma barra; recusa `//`, barra invertida, caracteres de controle, `/api`, `/entrar` | `src/lib/destino-seguro.ts` |
| Alguém ver dados do condomínio sem login | **Nada abre sem login**: o proxy manda toda área sem cookie para `/entrar`; o layout do morador exige `area.morador`; cada página, ação, leitura e exportação confere a sessão e a permissão de novo. O condomínio vem sempre da sessão (o `?c=` só monta o login em `/entrar`). Usuários e senhas são criados **só pelo síndico** | `src/proxy.ts`, `src/server/contexto.ts`, `src/app/(morador)/layout.tsx` |
| Morador ver dados de outra casa | Cada leitura da área do morador devolve uma lista fechada de campos; agenda mostra só "Ocupado"; financeiro só meses publicados e sem quem lançou | `src/server/dados/morador.ts` |
| Código de visitante copiado do banco | No banco fica só o HMAC (segredo `PORTARIA_SEGREDO_CODIGO`, obrigatório em produção); código de um dia vale uma vez só | `src/lib/portaria.ts`, `src/server/acoes/portaria.ts` |
| Adivinhar códigos de visitante | Limite de 40 consultas de código por porteiro a cada 5 min; 30 autorizações por casa por hora | `src/server/acoes/portaria.ts` |
| Duas reservas no mesmo horário | Trava por horário + conferência de sobreposição na mesma transação | `src/server/dados/reservas.ts` |
| Golpe do PIX (trocar a chave da taxa) | Só o papel **admin** altera a chave, mesmo com `informacoes.gerenciar` extra; a tela do morador lembra de conferir o favorecido; a auditoria guarda só o tipo da chave, nunca a chave | `src/server/acoes/informacoes.ts` |
| Morador ler nota interna de solicitação | Leitura da casa só com `publico == true` (servidor e regras) | `src/server/dados/solicitacoes.ts`, `firestore.rules` |
| Protocolo repetido | Contador por ano lido e gravado na mesma transação da abertura | `src/server/acoes/solicitacoes.ts` |
| Voto duplicado ou trocado | `votes/{unitId}` criado em transação (`create` falha se já existe); sem troca | `src/server/dados/enquetes.ts` |
| Ver resultado parcial pelo navegador | Regras: enquete só é lida direto pela gestão de enquetes; o servidor nem manda os totais quando o resultado é "após encerrar" | `firestore.rules`, `src/server/dados/enquetes.ts` |
| Descobrir em quem a casa votou (votação oficial) | Não existe documento de cédula: só `votantes/{casa}` (quem votou, sem o voto) e a contagem num documento único (`urna/contagem`), gravados na mesma transação. Cópias do banco durante a votação ficam proibidas (veja "Votação oficial: sigilo e cópias do banco") | `src/server/dados/eleicoes.ts` |
| Ver parcial da votação oficial | A soma só é aberta 2 min depois do encerramento; os painéis mostram só quantas casas votaram; só a comissão (`eleicoes.gerenciar`) vê quais casas | `src/server/dados/eleicoes.ts`, `src/server/dados/votacao-links.ts` |
| Link de voto adivinhado ou reaproveitado | Código de 10 caracteres (crypto) + senha de 6 números; no índice só os hashes; 5 senhas erradas por celular a cada 15 min e 30 por hora travam o link; o cookie da senha certa é assinado (HMAC) pelo servidor; "Trocar link" invalida o antigo na hora | `src/server/dados/votacao-links.ts` |
| Mudar quem pode votar no meio da votação | Lista de casas aptas congelada quando a votação abre; bloquear, desbloquear, ativar e inativar casas são recusados com a votação aberta | `src/server/dados/eleicoes.ts` |
| Chamar de fora a rotina de reserva do resultado | `CRON_SECRET` (cabeçalho `Authorization: Bearer`, comparado em tempo constante; a Vercel manda sozinha). Sem ele: no máximo 1 vez por minuto e sem devolver dados | `src/app/api/eleicoes/finalizar/route.ts`, `scripts/enviar-segredos-vercel.mjs` |
| Link malicioso em documento ou votação | Só `https`, sem usuário/senha no link, sem localhost/IP; abre em nova aba com `noopener noreferrer` | `src/lib/documentos.ts`, `src/lib/validacao-informacoes.ts` |
| Texto com código em comunicado ou anúncio | Sempre mostrado como texto (o React escapa; nada de HTML); caracteres invisíveis removidos | `src/lib/validacao-comunicados.ts` |
| Dados pessoais em anúncio | Recusa CPF e números que pareçam cartão; WhatsApp só se o autor marcar que quer mostrar | `src/lib/validacao-classificados.ts` |
| Relatório expor alguém | Só totais; as consultas usam `.select()` sem nomes, casas ou textos; CSV protegido contra fórmulas | `src/server/dados/relatorios.ts`, `src/lib/relatorios.ts` |

## Pendências conhecidas (planejadas)

- **Login dos moradores**: pronto; falta o teste no Firebase real (conferir que o domínio `.invalid` é aceito no `updateUser` e no login — o simulador aceitou). Se o Firebase real recusar, troque só `SUFIXO_EMAIL_MORADOR` em `src/lib/usuario-morador.ts` por outro domínio que não exista (ex.: `portal.local`).
- **Suspender morador**: hoje o contexto barra na hora (sessão recusada); a conta do Firebase Auth continua habilitada, mas não abre nada.
- **`CRON_SECRET` na Vercel**: configurar antes de 29/11 com `node scripts/enviar-segredos-vercel.mjs` (gera o segredo se não existir) e fazer Redeploy. Passo a passo em [VOTACAO-CARGA.md](VOTACAO-CARGA.md#14-cron_secret-senha-da-rotina-de-reserva).
- **CSP com nonce** no lugar de `'unsafe-inline'`: Fase 6.
- **Revisão de segurança e testes de concorrência**: Fase 6.

## LGPD

- **Mínimo necessário**: visitante = nome, data, horário e placa (opcional). Nada de CPF/RG por padrão.
- **Retenção proposta** (a confirmar com o síndico): nomes e placas de visitantes anonimizados após **90 dias**; registros de entrada/saída mantidos por **1 ano**; auditoria mantida enquanto houver obrigação de prestação de contas. Hoje a limpeza de 90 dias é feita pelo botão **"Remover nomes antigos agora"** em `/admin/portaria` (função `limparVisitantesAntigos`): o nome vira "Nome removido (LGPD)" e a observação é apagada; o registro continua (para a contagem) e tudo é auditado. Uma tarefa agendada (Vercel Cron) pode chamar a mesma função depois.
- **Separação**: morador nunca vê dados pessoais de outra casa (nas reservas aparece só "Ocupado"); portaria não vê financeiro.
- **Publicado de propósito**: o **nome e o telefone do responsável pelas reservas** e o **telefone da ronda** são publicados pelo síndico para todos os moradores. Nos **classificados aprovados** aparecem só o **primeiro nome** e o **WhatsApp que o próprio autor escolheu mostrar** (com aviso e confirmação); a casa do autor só a moderação vê.
- **Enquetes**: a auditoria registra que a casa votou, **sem a opção**; ninguém da gestão vê o voto de cada casa. (Limite conhecido: quem tem `auditoria.ver` e compara os totais antes e depois de um voto pode deduzir a opção; para enquetes sensíveis, use "resultado só depois de encerrar".)
- **Votação oficial**: os contatos da lista do Word (nome e telefones) ficam em `contatosVotacao/{casa}` e o código e a senha de cada link em `elections/{id}/links/{casa}` (para reenviar); só a comissão vê. Depois do resultado, o botão **"Apagar dados pessoais da votação"** (tela da eleição) apaga os links (códigos e senhas) e desativa os índices dos códigos (sem senha nem casa). A lista de contatos fica, porque é do condomínio (a portaria e a importação de moradores usam); apagar ou atualizar telefones é feito no cadastro. Fica o registro da eleição: quais casas votaram (nunca o voto), a contagem, a ata com as assinaturas e a auditoria.
- **Solicitações**: a casa vê só as próprias; a administração aparece como "Administração" (sem o nome de quem respondeu); notas internas nunca chegam ao morador.
- **E-mail da equipe**: fica só no Firebase Authentication, não no Firestore; na auditoria aparece mascarado (`jo•••@gmail.com`).
- **Morador**: não precisa de e-mail. O usuário (código) fica em `members/{uid}.usuario` e no índice `usernames/{codigo}`; a auditoria registra o usuário e o nome, nunca a senha. O telefone (se cadastrado) só é usado para abrir o WhatsApp do síndico na conversa certa.
- **Sem área pública**: nada do condomínio aparece sem login (decisão do dono). O síndico controla quem tem usuário e senha e pode suspender o acesso a qualquer momento.
- **Finalidade**: dados usados só para a gestão do condomínio; sem analytics, sem anúncios, sem fontes ou scripts de terceiros além do reCAPTCHA.
- **Transparência**: a prestação de contas mostra só informações coletivas aprovadas para divulgação, sem dados bancários ou pessoais.

## Backup e restauração

- **Com plano Blaze**: backups agendados do Firestore (diários, retenção de 7 a 14 dias) e recuperação a um ponto no tempo (PITR). **Exceção — votação oficial:** o PITR fica **DESLIGADO** e não há backup nem exportação durante a votação (da abertura até o encerramento + 5 min). O PITR pode ser ligado **depois do resultado**, de preferência no dia seguinte (nunca antes de 1 hora depois do encerramento). Motivo e comandos logo abaixo.
- **Só gratuito (Spark)**: exportação manual periódica (`gcloud firestore export`) para um bucket — também exige faturamento ativo para o bucket; alternativa é exportar por script com o Admin SDK para arquivos JSON guardados com segurança. Nunca durante uma votação oficial.
- Decisão do plano: antes da Fase 4. O teste de restauração entra na Fase 6.

## Votação oficial: sigilo e cópias do banco

O código não guarda a ligação entre a casa e o voto: não existe cédula, só "a casa votou" (`votantes/{casa}`) e a contagem num documento único (`urna/contagem`). Mas **qualquer cópia do banco tirada durante a votação** quebra isso: duas cópias (ou as versões minuto a minuto do PITR) mostram quantos Sim e Não entraram entre uma e outra e quais casas votaram nesse intervalo. Se só uma casa votou naquele minuto, o voto dela aparece. Uma cópia sozinha já mostra parcial antes do encerramento, o que as regras proíbem.

**Antes de cada votação oficial (para 29/11/2026: até 27/11):**

1. **PITR desligado.**

   ```bash
   gcloud firestore databases describe --database="(default)" --project=jardim-do-lago-af4b3
   ```

   Tem de mostrar `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED` (e `versionRetentionPeriod: 3600s`). Se estiver ligado: `gcloud firestore databases update --database="(default)" --no-enable-pitr --project=jardim-do-lago-af4b3`.
2. **Nenhum backup ou exportação entre a abertura e o encerramento + 5 min.** `gcloud firestore backups schedules list --database="(default)" --project=jardim-do-lago-af4b3` deve vir vazio. O horário do backup diário não é escolhido por nós: se houver agendamento, apague antes (`gcloud firestore backups schedules delete --database="(default)" --backup-schedule=<ID> --project=jardim-do-lago-af4b3`) e recrie depois do resultado (`gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=7d --project=jardim-do-lago-af4b3`). Confira o Cloud Scheduler (`gcloud scheduler jobs list --location=southamerica-east1 --project=jardim-do-lago-af4b3`) e não rode `gcloud firestore export` nesse horário.
3. **Poucas pessoas com acesso ao banco.** O Firestore sempre guarda a última 1 hora de versões, e quem tem a **chave da conta de serviço** (`FIREBASE_PRIVATE_KEY`) ou é Proprietário/Editor do projeto consegue ler o banco direto. Até a votação: só o desenvolvedor com a chave; apague cópias soltas (o `.json` baixado) e chaves antigas (Google Cloud → IAM → Contas de serviço → Chaves); revise quem é membro do projeto. Durante a votação, ninguém abre a eleição no console do Firebase.
4. **Trocar a chave depois da eleição**, nunca durante: nova chave no Firebase → `node scripts/importar-chave.mjs "<arquivo.json>"` → `node scripts/enviar-segredos-vercel.mjs` → Redeploy → apagar o `.json` e excluir a chave antiga. (Sem `VOTO_COOKIE_SEGREDO`, o cookie da senha do link é assinado com um valor tirado dessa chave: trocar no meio obrigaria todo mundo a digitar a senha de novo, e deploy no dia é risco.)

**Depois do resultado:** o PITR e o backup agendado podem voltar, de preferência a partir do dia seguinte. Nunca antes de 1 hora depois do encerramento: o banco ainda guarda essa última hora, e ligar o PITR antes pode fazer as versões da votação ficarem guardadas por 7 dias.
