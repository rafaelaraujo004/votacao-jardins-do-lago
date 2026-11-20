# Votação: preparada para as 225 casas no mesmo dia

**Resumo:** o portal aguenta as 225 casas votando quase ao mesmo tempo. Num teste com as 225 casas abrindo o link, digitando a senha e votando **no mesmo instante**, mais 25 casas com um segundo celular votando junto, deu tudo certo: **225 votos contados em cerca de 5,5 segundos**, nenhum voto perdido ou repetido, e nenhuma casa barrada por engano.

As regras da eleição **não mudaram**: chapa única (Sim ou Não), um voto por casa, voto secreto (o portal guarda que a casa votou, nunca em quê), resultado só depois do encerramento.

---

## O que foi conferido

| Ponto | Situação |
|---|---|
| Limite de tentativas por endereço de internet | **Corrigido** (era o maior risco, veja abaixo) |
| Cookie que lembra a senha certa | **Corrigido**: agora é assinado pelo servidor e não pode ser falsificado |
| Rajada de senhas erradas no mesmo link | **Corrigido**: as tentativas do mesmo link entram em fila |
| Contador de votos (urna) recebendo muitos votos no mesmo segundo | Continua em **um documento só, de propósito** (sigilo, veja abaixo); aguentou o teste |
| Aviso "algo mudou" para a tela da comissão a cada voto | **Reforçado**: sai depois da resposta ao morador, sem atrapalhar o voto |
| Dois celulares da mesma casa votando juntos | Já estava certo: só o primeiro voto vale, o outro vê "a casa já votou" |
| Votar depois das 17h, casa bloqueada, link trocado | Já estava certo e continua testado |
| Tamanho da página de voto no celular | Leve: as fotos da chapa têm cerca de 10 KB cada |
| Servidor (Vercel) e banco (Firebase) | Sobra capacidade: 225 casas usam uma fração mínima do que os dois aguentam |

## O que mudou (em linguagem simples)

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
Cogitamos dividir a urna em 10 partes para aguentar mais votos por segundo. A revisão mostrou um problema de **sigilo**: o banco guarda a hora em que cada documento foi criado e alterado. Com a urna dividida, essas horas coincidiriam com o voto de algumas casas, e uma parte com todos os votos iguais revelaria em quem essas casas votaram. Com o documento único, isso não acontece. E o teste mostrou que um documento só dá conta: votos ao mesmo tempo apenas esperam a vez, sem se perder.

## O teste de carga

Arquivos: `portal/tests/integracao/carga-votacao.test.ts` e `carga-acoes-voto.test.ts` (rodam com os outros testes do simulador: `npm run test:emu`).

- 225 casas abrem o link, digitam a senha e votam **ao mesmo tempo**, todas pelo **mesmo endereço de internet** (o pior caso).
- 25 dessas casas votam também por um segundo celular, no mesmo instante.
- Resultado: 250 acessos em 5,5 s · 225 votos contados · 25 segundos celulares recusados ("a casa já votou") · nenhum bloqueio por tentativas · a urna e a apuração batem com os votos.
- Outro teste: 10 casas erram a senha 2 vezes cada, pelo mesmo endereço, e mesmo assim as 40 casas do teste conseguem votar.
- Pelas **ações da própria página** (o mesmo caminho do celular, com cookie e endereço de verdade): 60 casas atrás do mesmo endereço digitam a senha e votam juntas — o dobro do que o limite antigo deixava — e todas conseguem.

> O teste roda no simulador do Firebase, no computador. No site oficial o banco é mais rápido que o simulador; o servidor da Vercel abre mais "atendentes" sozinho quando chega muita gente.

---

## Roteiro do dia (comissão)

### Na véspera (sábado, 28/11)

1. Abra **Votação oficial** → a eleição → confira a chapa, as fotos e o horário (29/11, das 7h às 17h).
2. Em **Links de voto e WhatsApp**: confira que todas as casas têm link (botão "Gerar links" cria os que faltam).
3. **Envie os links já na véspera.** Quem abrir antes das 7h vê "A votação abre domingo às 7h" e já deixa a mensagem guardada. Assim a comissão não precisa mandar 225 mensagens às 7h da manhã.
4. **Casas sem contato na lista (194, 195, 196, 197 e 198):** consiga o WhatsApp delas ou combine a entrega do link e da senha em mãos.
5. Não é preciso (nem possível) mudar a eleição depois de publicada.

### No dia, antes de abrir (6h45)

1. Abra o portal no celular ou computador da comissão: **Votação oficial** → a eleição. Isso "acorda" o servidor; o primeiro acesso do dia pode levar 1 a 2 segundos a mais.
2. Deixe aberta a tela com o **mapa de quem votou**: ela se atualiza sozinha.
3. Tenha à mão a tela **Links de voto e WhatsApp** para reenviar mensagens.

### Durante a votação (7h às 17h)

| Situação | O que fazer |
|---|---|
| Morador diz que não recebeu o link | Em **Links de voto e WhatsApp**, toque no WhatsApp da casa e reenvie. |
| Morador esqueceu ou apagou a senha | A senha está na mesma mensagem do link. Reenvie a mensagem. |
| "Senha errada muitas vezes" | Peça para esperar 15 minutos, ou use **Trocar link** (gera link e senha novos; o antigo para de valer na hora) e reenvie. |
| "Muitas tentativas seguidas" | Só acontece com muitos links errados vindos do mesmo lugar. Espere 10–15 minutos ou mande o link novo. |
| Dois moradores da mesma casa | Vale o primeiro voto. O segundo vê "voto já realizado". É assim mesmo. |
| Casa aparece como bloqueada | Foi a comissão que bloqueou. Confira em **Bloquear casas**. |
| Morador sem internet | Ele pode votar pelo celular de um vizinho ou parente: o link é da casa, não do aparelho. |
| Link "não existe" | O link pode ter sido trocado. Reenvie a mensagem mais recente da tela de links. |
| O site parece lento ou fora do ar | Espere 1 minuto e tente de novo. Se continuar, avise o suporte (Rafael). Os votos já dados estão guardados. |

### Encerramento (17h)

- Às **17h** a votação fecha sozinha: ninguém mais consegue votar.
- O resultado aparece **2 minutos depois (17h02)**, para os votos que estavam sendo gravados às 16h59 entrarem na conta. Antes disso ninguém, nem a comissão, vê parcial.
- Cada casa que votou pode baixar o **comprovante** (PDF) pelo próprio link: ele mostra que a casa votou, nunca em quê.

### Onde olhar se algo der errado (suporte)

- **Vercel** → projeto `portal-jardins-do-lago` → *Logs*: erros do site.
- **Firebase** → projeto `jardim-do-lago-af4b3` → *Firestore* → *Uso*: leituras e gravações do banco.
- **Auditoria** no portal (`/admin/auditoria`): registra cada casa que votou (nunca o voto).
