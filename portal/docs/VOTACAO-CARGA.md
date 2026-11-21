# Votação de 29/11/2026: roteiro e preparo (220 casas)

**Resumo:** a eleição do síndico e conselho 2026/2027 é no **domingo, 29/11/2026, das 9h às 14h** (horário do condomínio, Belém). Votam **220 casas**: os lotes 1 a 225, menos os lotes **194 a 198**, que estão **inativos** (não são casas). Chapa única, cada casa responde **Sim ou Não** uma vez, pelo link que recebe no WhatsApp com uma senha de 6 números. O resultado sai sozinho **às 14h02**.

O portal aguenta as 220 casas votando quase ao mesmo tempo (teste com 225 casas no mesmo instante, mais adiante neste documento).

As regras da eleição **não mudam**: um voto por casa, voto secreto (o portal guarda que a casa votou, nunca em quê), ninguém vê parcial antes do encerramento, só a comissão vê **quais** casas votaram, eleita com metade mais 1 dos votos válidos (Sim + Não). As casas que não votarem aparecem como **"Sem votar"** e ficam fora dessa conta.

> **Horário:** o script de cadastro (`scripts/cadastrar-votacao.ts`) criou o rascunho com 7h–17h; a comissão mudou no portal para **9h–14h**, e é isso que vale (conferido no banco em 21/11: eleição `i9PncwmlMvHJuCwWGY1g`, 29/11 das 9h às 14h, 220 casas aptas). Na véspera, confira na tela da eleição ("Abre" e "Encerra").

---

## Calendário

| Quando | Quem | O quê |
|---|---|---|
| Até sexta, 27/11 | Desenvolvedor | Testes na demonstração, uso da Vercel, Firestore sem cópias, `CRON_SECRET`, firewall pronto, plano B combinado (seções 1 e 5) |
| Sexta, 27/11 (noite) | Comissão | Aviso no grupo do condomínio: de quais números o link vai chegar (seção 2) |
| Sábado, 28/11, desde cedo | Comissão | Conferir casas aptas e mandar os links, com pausas (seções 2 e 3) |
| Até domingo, 29/11, **8h59** | Comissão | Última conferência das casas aptas, bloqueadas e inativas. **Depois das 9h nada disso muda** (seção 3) |
| Domingo, 29/11, 9h–14h | Comissão e suporte | Votação (seção 4) |
| Domingo, 29/11, 14h02 | Sozinho | Resultado divulgado a todos (aviso no celular e sino) |
| Depois do resultado | Comissão e desenvolvedor | Ata assinada, relatório final, apagar dados pessoais da votação, trocar a chave do servidor (seção 6) |

---

## 1. Antes do dia (desenvolvedor, até 27/11)

### 1.1 Testar antes do dia

- **Teste SEMPRE no condomínio de demonstração** (`jardins-do-lago-demo`), nunca no real. No real, publicar e encerrar mandam aviso no celular de **todos os moradores**, e o resultado de teste aparece no topo do Início de todo mundo.
- O script `scripts/teste-votacao.ts` usa as mesmas funções do portal e **se recusa** a rodar num condomínio que não seja de demonstração. No Firebase real, condomínio de demonstração (na pasta `portal`):

  ```bash
  npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/teste-votacao.ts criar --real --minutos 10
  npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/teste-votacao.ts votar --real --sim 2 --nao 1
  npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/teste-votacao.ts situacao --real
  ```

  `criar` publica uma votação curta, gera os links e mostra o link e a senha de cada casa de teste; `votar` vota por algumas casas; `situacao` mostra a fase, quantas casas votaram e, depois do encerramento + 2 min, divulga o resultado (aviso só para o condomínio de demonstração). Use `--abre-em 5` para ver a contagem regressiva antes de abrir.
- **Se um teste foi feito no condomínio real por engano**, apague com `scripts/excluir-votacao-teste.ts`. Ele **só apaga eleição com a palavra "TESTE" no título** (a eleição de verdade nunca é apagada por ele) e, sem `--apagar`, só mostra o que seria apagado:

  ```bash
  npx tsx scripts/diagnostico-votacao.ts                                                        # mostra as eleições e o id de cada uma
  npx tsx scripts/excluir-votacao-teste.ts --condominio jardins-do-lago --id <idDaEleicao>           # só confere
  npx tsx scripts/excluir-votacao-teste.ts --condominio jardins-do-lago --id <idDaEleicao> --apagar  # apaga
  ```

  Apaga a eleição de teste e tudo dela (votos, links, fotos, assinaturas). A auditoria fica e ganha o registro "eleicao.excluir". Se o teste chegou a mandar aviso, explique no grupo do condomínio que foi um teste.
- **Conferir a eleição real:** `npx tsx scripts/diagnostico-votacao.ts` (só leitura) deve mostrar a eleição oficial com `status=publicada`, abre 29/11 9:00, fecha 29/11 14:00 e `casasAptas=220`, e **nenhuma** eleição de teste no condomínio real.

### 1.2 Vercel no plano Hobby (gratuito)

O plano gratuito tem limites mensais. Se um limite estoura, a Vercel pode **pausar o site**, e isso não pode acontecer no dia.

1. **Até 27/11:** abra **Vercel → Usage** e veja, para o ciclo atual: **Function Invocations** (invocações), **Fluid Active CPU** (CPU ativa) e **Edge Requests** (requisições). Cada item mostra quanto foi usado e o limite; a tela mostra também as datas do ciclo.
2. **Se qualquer item passar de ~60%**, ou se o ciclo recomeçar muito perto de 29/11 (aí fica difícil prever a folga), **suba para o Pro naquele mês** (Settings → Billing). Depois da eleição dá para voltar ao Hobby.
3. **No dia:** os logs do Hobby ficam só **cerca de 1 hora**. Olhe **Vercel → projeto `portal-jardins-do-lago` → Logs** (filtro de erros) a cada hora (10h, 11h, 12h, 13h e 14h05) e anote ou fotografe qualquer erro.
4. **Deixe pronto no Firewall da Vercel** (projeto → Firewall), para usar só se houver ataque (muito tráfego estranho, site lento):
   - **Attack Challenge Mode**: um botão. Ligado, todo visitante passa por uma conferência rápida do navegador antes de abrir o site. Ligue só durante um ataque e desligue depois.
   - **Regra de limite por IP** para `/votar/*`, `/api/votar/*` e `/assinar-ata/*`: nova regra com "Request Path começa com" `/votar/` **ou** `/api/votar/` **ou** `/assinar-ata/`, ação **Rate Limit** por IP (janela de 60 s). O limite tem de ser **generoso** (sugestão: 600 pedidos por minuto): muitos celulares saem pelo mesmo IP da operadora ou do Wi-Fi do condomínio, e cada link aberto pergunta o painel a cada 30 s. Deixe a regra criada **só registrando (Log)** e mude para bloquear (429 ou Challenge) apenas se aparecer ataque. Se o Hobby não deixar criar a regra, é mais um motivo para o Pro no mês.
   - O portal já tem os próprios limites (senhas erradas por link e por IP). O firewall é proteção extra contra volume de tráfego.
5. **Plano B combinado com a comissão** (seção 5): cédula de papel se o site ficar fora do ar.

### 1.3 Firestore sem cópias durante a votação (sigilo)

**Antes de 29/11**, confira que **não existe cópia do banco** entre a abertura (9h) e o encerramento + 5 min (14h05):

- **Recuperação a um ponto no tempo (PITR) DESLIGADA.** Com o PITR ligado, o Firebase guarda o banco minuto a minuto por 7 dias; comparando a contagem da urna minuto a minuto com quem votou em cada minuto, daria para descobrir o voto de algumas casas.

  ```bash
  gcloud firestore databases describe --database="(default)" --project=jardim-do-lago-af4b3
  ```

  Tem de aparecer `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_DISABLED` (e `versionRetentionPeriod: 3600s`). Se estiver ligado: `gcloud firestore databases update --database="(default)" --no-enable-pitr --project=jardim-do-lago-af4b3`.
- **Nenhum backup ou exportação agendada** nessa janela: `gcloud firestore backups schedules list --database="(default)" --project=jardim-do-lago-af4b3` deve vir vazio (o horário do backup diário não é escolhido por nós; se houver agendamento, apague antes de 28/11 e recrie depois do resultado). Confira também o Cloud Scheduler (`gcloud scheduler jobs list --location=southamerica-east1 --project=jardim-do-lago-af4b3`) e não rode `gcloud firestore export` nesse horário.
- **Chave da conta de serviço** (`FIREBASE_PRIVATE_KEY`): quem tem a chave lê o banco direto. Até a eleição, só o desenvolvedor; apague cópias soltas (o `.json` baixado) e chaves antigas em Google Cloud → IAM → Contas de serviço → Chaves. **Troque a chave depois da eleição** (seção 6), nunca durante: o lembrete da senha no celular dos moradores é assinado com um valor tirado dessa chave, e trocar no meio obriga todo mundo a digitar a senha de novo.
- O PITR pode ser ligado **depois do resultado**, de preferência no dia seguinte (30/11). Nunca antes das 15h05 do dia 29: o banco sempre guarda a última 1 hora, e ligar o PITR antes disso pode fazer a última hora da votação ficar guardada por 7 dias.

Detalhes em [SEGURANCA-LGPD.md](SEGURANCA-LGPD.md#votação-oficial-sigilo-e-cópias-do-banco).

### 1.4 `CRON_SECRET` (senha da rotina de reserva)

O resultado normalmente é divulgado pela primeira tela que abre a votação depois das 14h02. Por garantia, a Vercel chama todo dia a rotina `/api/eleicoes/finalizar` às **18h05** de Belém (`vercel.json`; no Hobby a Vercel pode rodar em qualquer minuto entre 18h e 18h59). A rotina **já aceita** o `CRON_SECRET`: com ele configurado, só pedidos com `Authorization: Bearer <CRON_SECRET>` passam, e a própria Vercel manda esse cabeçalho sozinha. Sem ele, qualquer pessoa pode chamar a rotina (no máximo uma vez por minuto; ela não devolve dados).

Para configurar (na pasta `portal`):

```bash
node scripts/enviar-segredos-vercel.mjs
```

Se ainda não existir `CRON_SECRET` no `.env.production.local`, o script sorteia um (48 caracteres), guarda no arquivo e envia para a Vercel junto com os outros segredos, sem mostrar nenhum valor na tela. Depois, faça um **novo deploy** (Vercel → Deployments → Redeploy): a variável só vale nos deploys feitos depois dela. Para criar à mão: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` e cadastre como `CRON_SECRET` em **Settings → Environment Variables** (Production, sensível).

Faça isso **até 27/11**. Nada de deploy no dia da votação.

---

## 2. Envio dos links (comissão, sábado 28/11)

**Quanto tempo leva:** cada casa leva **cerca de 45 a 60 segundos** (achar a casa, abrir o WhatsApp, mandar a mensagem, mandar as imagens do passo a passo, voltar). Para 220 casas, **uma pessoa sozinha levaria 3 a 4 horas**, sem pausas. Por isso:

1. **Divida entre 2 ou 3 pessoas da comissão**, cada uma com o **seu próprio login** (confira antes que cada login abre **Votação oficial → a eleição → Links de voto e WhatsApp**). Sugestão de divisão por número da casa:
   - 3 pessoas: casas 1–75, 76–150 e 151–225;
   - 2 pessoas: casas 1–112 e 113–225.
   Cada pessoa usa o filtro **"Não enviados"** e a **busca por casa** para ficar só na sua parte. O portal anota cada envio (o número "Enviados" sobe), então ninguém manda duas vezes para a mesma casa.
2. **Comece cedo no dia 28** (por exemplo, às 8h). Quem abrir o link antes das 9h de domingo vê "A votação ainda não abriu" e o passo a passo, e guarda a mensagem para o dia.
3. **Faça pausas.** Não mande centenas de mensagens em menos de 1 hora: o WhatsApp pode **restringir a conta** (muitas mensagens com link para números que não têm o seu contato salvo parecem propaganda). Sugestão: blocos de 20 a 25 casas e 10 minutos de pausa, no máximo 50 a 60 casas por hora em cada celular.
4. **Avise antes no grupo do condomínio** (sexta à noite ou sábado cedo) **de qual número** o link vai chegar (os números das 2 ou 3 pessoas da comissão), peça para salvarem o número e responderem "recebi". Isso evita que achem que é golpe e ajuda o WhatsApp a não bloquear. Lembre: "o link e a senha são só da sua casa; não repasse". Dá para mandar o passo a passo no grupo pelo botão **"Mandar no grupo do condomínio"** (ou em PDF).
5. **Tenha um número reserva da comissão** para o dia: outro celular com WhatsApp, de alguém da comissão com login próprio já testado. Se um número for restringido, continue pelo reserva e avise no grupo.
6. **Casa sem telefone** (filtro **"Sem telefone"**):
   - **"Copiar mensagem"**: copia o link, a senha e o passo a passo, para entregar por outro meio (impresso em envelope fechado, em mãos);
   - **"Mandar para outro número"**: quando o morador passar outro número (de um parente, por exemplo), digite e mande.
   Entregue só para quem é da casa: quem tem o link e a senha vota pela casa. **Nunca** poste a mensagem de uma casa no grupo.
7. **Mandou para o número errado?** Use **Trocar link** na hora (o link antigo para de valer) e mande o novo para o número certo.

---

## 3. Casas aptas: conferir até 8h59 de domingo (comissão)

Faça no sábado, antes de mandar os links, e de novo no domingo até **8h59**:

1. Abra o portal: **Votação oficial → "Eleição do síndico e conselho 2026/2027"**. Confira a chapa, as fotos e o horário (**Abre:** 29/11 às 9h · **Encerra:** 29/11 às 14h).
2. Em **Participação**, confira **"Votaram 0 de 220 casas"** e **"Faltam 220"**. 220 = 225 lotes − 5 inativos (194 a 198). Se a comissão bloqueou casas, o número é 220 menos as bloqueadas: confira se a conta bate.
3. **Casas bloqueadas:** em **"Casas bloqueadas de votar"** (na tela da eleição), revise a lista com a comissão e bloqueie ou desbloqueie o que precisar.
4. **Casas inativas:** em **Pessoas → Unidades**, confira que só os lotes 194 a 198 estão "Inativa". Se alguma casa estiver inativa por engano, reative; se algum lote não for casa, inative. O número de casas aptas da eleição acompanha sozinho.
5. Em **Links de voto e WhatsApp**, confira que todas as casas têm link (o botão **"Gerar links"** cria os que faltam).

> **Depois das 9h, nada disso muda.** Quando a votação abre, a lista de casas aptas fica **congelada**: o sistema **recusa bloquear, desbloquear, ativar e inativar** casas até o encerramento. Corrija tudo antes.

---

## 4. Domingo, 29/11 (comissão e suporte)

### Antes de abrir (8h30)

1. Abra o portal no celular ou computador da comissão: **Votação oficial → a eleição**. Isso "acorda" o servidor (o primeiro acesso do dia pode levar 1 a 2 segundos a mais).
2. Faça a última conferência da seção 3 até **8h59**.
3. Deixe aberta a tela com o **mapa de quem votou**: ela se atualiza sozinha.
4. Tenha à mão a tela **Links de voto e WhatsApp** para reenviar mensagens, e o número reserva.

### Durante a votação (9h às 14h)

| Situação | O que fazer |
|---|---|
| Morador diz que não recebeu o link | Em **Links de voto e WhatsApp**, busque a casa e reenvie pelo WhatsApp (ou **"Mandar para outro número"**). |
| Morador esqueceu ou apagou a senha | A senha está na mesma mensagem do link. Reenvie a mensagem. |
| "Senha errada muitas vezes" | Peça para esperar 15 minutos, ou use **Trocar link** (gera link e senha novos; o antigo para de valer na hora) e reenvie. |
| "Muitas tentativas seguidas" | Só acontece com muitos links errados vindos do mesmo lugar. Espere 10–15 minutos ou mande o link novo. |
| Dois moradores da mesma casa | Vale o primeiro voto. O segundo vê "voto já realizado". É assim mesmo. |
| Casa aparece como bloqueada (ou deveria estar bloqueada, ativa ou inativa) | **Não dá para mudar com a votação aberta**: o sistema recusa bloquear, desbloquear, ativar e inativar até o encerramento. **Anote a casa e o motivo para a ata.** |
| Morador sem internet | Ele pode votar pelo celular de um vizinho ou parente: o link é da casa, não do aparelho. |
| Link "não existe" | O link pode ter sido trocado. Reenvie a mensagem mais recente da tela de links. |
| WhatsApp da comissão restringido | Continue pelo **número reserva** e avise no grupo do condomínio. |
| O site parece lento ou fora do ar | Espere 1 minuto e tente de novo. Se continuar, avise o suporte (Rafael). Os votos já dados estão guardados. Fora do ar por muito tempo: plano B (seção 5). |

### Encerramento (14h) e resultado (14h02)

- Às **14h** a votação fecha sozinha: ninguém mais consegue votar.
- O resultado aparece **2 minutos depois (14h02)**, para os votos que estavam sendo gravados às 13h59 entrarem na conta. Antes disso ninguém, nem a comissão, vê parcial.
- O portal **divulga sozinho**: aviso no celular e no sino para todos, e a animação do resultado no topo do Início. Se às 14h10 a tela da eleição ainda disser "Divulgando o resultado...", atualize a página (abrir a tela já faz a divulgação). A rotina de reserva das 18h05 cobre o caso raro de ninguém abrir o portal.
- Cada casa que votou pode baixar o **comprovante** (PDF) pelo próprio link: ele mostra que a casa votou, nunca em quê.

---

## 5. Plano B: cédula de papel (combinar com a comissão antes)

Combine **antes de 29/11** e registre na ata se for usado:

- **Quando usar:** por exemplo, site fora do ar por mais de 30 minutos seguidos, sem previsão de volta. **Quem decide:** a comissão, ouvindo o suporte.
- **O que deixar pronto:** cédulas impressas (Sim / Não para a chapa), urna, lista das casas aptas para assinatura.
- **Sem voto duplo:** os votos já dados pelo link **continuam valendo** e estão guardados. Casa que já votou pelo link não vota no papel. A comissão pode fotografar o mapa de quem votou a cada hora; o suporte consegue a lista de casas que votaram direto no Firebase, mesmo com o site fora.
- **Apuração:** soma dos votos do portal (resultado depois das 14h02) com os do papel, conferida pela comissão e registrada na ata.

---

## 6. Depois do resultado

1. **Assinaturas da ata (comissão):** na tela da eleição, **"Relatório final (imprimir ou PDF)"** abre a ata com 4 assinaturas: 2 da comissão eleitoral, síndico(a) e testemunha. Cada uma pode assinar **no aparelho** ("Assinar aqui": nome completo e assinatura com o dedo) ou **por link** ("Mandar link pelo WhatsApp" ou "Copiar link"; o link vale uma vez).
2. **Relatório final:** a mesma página tem os dados da votação, a linha do tempo, o resultado, os gráficos e as casas sem votar. Depois das 4 assinaturas, imprima ou salve em PDF e guarde com os documentos do condomínio. Use **"Avisar no grupo do condomínio"** para mandar o resultado no grupo.
3. **Apagar dados pessoais da votação (comissão):** na tela da eleição, depois do resultado, o botão **"Apagar dados pessoais da votação"** apaga as **senhas e os códigos dos links** de voto. Os links antigos passam a mostrar "Esta votação já terminou" (e não servem mais para baixar o comprovante pelo link; no portal, quem tem login continua baixando). A **lista de contatos** (nomes e telefones) **não** é apagada: ela é do condomínio e a portaria usa para avisar das encomendas. Fica o registro da eleição: quais casas votaram (nunca o voto), a contagem, a chapa, a ata com as assinaturas e a auditoria. Sugestão: apagar depois de a ata estar assinada e de dar alguns dias para quem quiser baixar o comprovante (por exemplo, até 6/12). A lista do Word com os telefones também é dado pessoal: guarde só onde precisa.
4. **Desenvolvedor:**
   - **Trocar a chave da conta de serviço:** gere uma chave nova no Firebase (Configurações do projeto → Contas de serviço), rode `node scripts/importar-chave.mjs "<arquivo.json>"` e `node scripts/enviar-segredos-vercel.mjs`, faça Redeploy, apague o `.json` baixado e **exclua a chave antiga** em Google Cloud → IAM → Contas de serviço → Chaves.
   - Se quiser, ligue o PITR ou recrie o backup agendado **a partir de 30/11** (seção 1.3).
   - Se subiu para o Pro só para a eleição, volte ao Hobby no fim do mês.

### Onde olhar se algo der errado (suporte)

- **Vercel** → projeto `portal-jardins-do-lago` → *Logs*: erros do site (no Hobby, só a última hora).
- **Vercel** → projeto → *Firewall*: tráfego, Attack Challenge Mode e a regra de limite por IP.
- **Firebase** → projeto `jardim-do-lago-af4b3` → *Firestore* → *Uso*: leituras e gravações do banco.
- **Auditoria** no portal (`/admin/auditoria`): registra cada casa que votou (nunca o voto).

---

## Apêndice: capacidade da votação (teste de carga)

Num teste com **225 casas** (mais que as 220 que votam) abrindo o link, digitando a senha e votando **no mesmo instante**, mais 25 casas com um segundo celular votando junto, deu tudo certo: **225 votos contados em cerca de 5,5 segundos**, nenhum voto perdido ou repetido, e nenhuma casa barrada por engano.

### O que foi conferido

| Ponto | Situação |
|---|---|
| Limite de tentativas por endereço de internet | **Corrigido** (era o maior risco, veja abaixo) |
| Cookie que lembra a senha certa | **Corrigido**: agora é assinado pelo servidor e não pode ser falsificado |
| Rajada de senhas erradas no mesmo link | **Corrigido**: as tentativas do mesmo link entram em fila |
| Contador de votos (urna) recebendo muitos votos no mesmo segundo | Continua em **um documento só, de propósito** (sigilo, veja abaixo); aguentou o teste |
| Aviso "algo mudou" para a tela da comissão a cada voto | **Reforçado**: sai depois da resposta ao morador, sem atrapalhar o voto |
| Dois celulares da mesma casa votando juntos | Já estava certo: só o primeiro voto vale, o outro vê "a casa já votou" |
| Votar depois do encerramento, casa bloqueada, link trocado | Já estava certo e continua testado |
| Tamanho da página de voto no celular | Leve: as fotos da chapa têm cerca de 10 KB cada |
| Servidor (Vercel) e banco (Firebase) | Sobra capacidade: 220 casas usam uma fração mínima do que os dois aguentam (no Hobby, confira o uso do mês: seção 1.2) |

### O que mudou (em linguagem simples)

**1. Ninguém é barrado por "muitas tentativas" sem ter errado.**
Antes, o portal contava **cada voto e cada senha certa** num limite de 30 tentativas a cada 10–15 minutos **por endereço de internet**. O problema: as operadoras de celular colocam centenas de aparelhos atrás do mesmo endereço, e o Wi-Fi do condomínio também junta todo mundo num só. Com muita gente votando junto, moradores honestos veriam "Muitas tentativas seguidas".
Agora **só contam as tentativas erradas** (senha errada, link que não existe). Votar e acertar a senha nunca gastam tentativas. As proteções de cada casa continuam: 5 senhas erradas por celular a cada 15 minutos e 30 por hora no total travam só aquele link.

**2. O "lembrete" da senha no celular não pode mais ser falsificado.**
Quando a senha está certa, o celular guarda um lembrete (cookie) por 6 horas. Antes, esse lembrete era calculado só a partir do link e da senha, então quem tivesse **só o link** poderia montá-lo no próprio computador e testar senhas sem passar pelos limites. Agora o lembrete é **assinado pelo servidor** com um segredo que nunca sai dele. (Problema antigo, encontrado na revisão; corrigido antes da eleição.)

**3. Senhas erradas em rajada no mesmo link entram em fila.**
Os limites de cada link (5 erros por celular a cada 15 minutos e 30 por hora no total) agora são conferidos junto com a senha, de uma vez só. Mesmo que alguém mande muitas tentativas no mesmo instante, elas são conferidas uma de cada vez e nenhuma passa do limite.

**4. A tela da comissão é avisada depois do voto.**
O aviso de "algo mudou" (que faz o mapa de quem votou se atualizar sozinho) é um documento só para o condomínio inteiro. Antes ele era gravado junto com cada voto; agora sai **depois** que o morador já recebeu a confirmação, no máximo uma vez por segundo, e o último voto de uma sequência sempre gera um aviso. O mapa continua se atualizando sozinho.

**Por que a urna continua sendo um documento só.**
Cogitamos dividir a urna em 10 partes para aguentar mais votos por segundo. A revisão mostrou um problema de **sigilo**: o banco guarda a hora em que cada documento foi criado e alterado. Com a urna dividida, essas horas coincidiriam com o voto de algumas casas, e uma parte com todos os votos iguais revelaria em quem essas casas votaram. Com o documento único, isso não acontece. E o teste mostrou que um documento só dá conta: votos ao mesmo tempo apenas esperam a vez, sem se perder. (Pelo mesmo motivo, nada de cópias do banco durante a votação: seção 1.3.)

### O teste

Arquivos: `portal/tests/integracao/carga-votacao.test.ts` e `carga-acoes-voto.test.ts` (rodam com os outros testes do simulador: `npm run test:emu`).

- 225 casas abrem o link, digitam a senha e votam **ao mesmo tempo**, todas pelo **mesmo endereço de internet** (o pior caso).
- 25 dessas casas votam também por um segundo celular, no mesmo instante.
- Resultado: 250 acessos em 5,5 s · 225 votos contados · 25 segundos celulares recusados ("a casa já votou") · nenhum bloqueio por tentativas · a urna e a apuração batem com os votos.
- Outro teste: 10 casas erram a senha 2 vezes cada, pelo mesmo endereço, e mesmo assim as 40 casas do teste conseguem votar.
- Pelas **ações da própria página** (o mesmo caminho do celular, com cookie e endereço de verdade): 60 casas atrás do mesmo endereço digitam a senha e votam juntas — o dobro do que o limite antigo deixava — e todas conseguem.

> O teste roda no simulador do Firebase, no computador. No site oficial o banco é mais rápido que o simulador; o servidor da Vercel abre mais "atendentes" sozinho quando chega muita gente.
