# Primeiro acesso: criar o administrador, a equipe e os moradores

Este guia explica, passo a passo, como o primeiro administrador (o síndico) passa a entrar no portal **de verdade**, como cria o acesso da equipe e dos **moradores** (usuário + senha enviados pelo WhatsApp), e como cada pessoa troca a própria senha.

> No computador local, com o simulador, nada disso é preciso: a tela de entrada tem os botões de demonstração, e a equipe demo também entra com e-mail e senha (veja `portal/.acesso-demo.txt`).

## Antes de começar

1. O Firebase real já precisa estar configurado (README, item 5): projeto criado, **E-mail/senha** ligado em Authentication, Firestore criado, regras publicadas.
2. O arquivo `portal/.env.local` precisa ter as credenciais do servidor (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) **e não pode ter** as linhas `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` (se elas estiverem lá, o script fala com o simulador, não com o Firebase real).

## 1. Criar o condomínio e o primeiro administrador

Não existe cadastro público no portal. O primeiro administrador nasce por um script, rodado no seu computador, dentro da pasta `portal`:

```bash
npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-email "email-do-sindico@exemplo.com" --admin-nome "Nome do Síndico"
```

O que o script faz:

- cria o condomínio no banco;
- cria a conta do síndico no Firebase Authentication, com uma **senha provisória** sorteada (ex.: `K7MP-4XQR-9TZW`);
- liga essa conta ao condomínio como **administrador**, marcada para **trocar a senha no primeiro acesso**;
- registra tudo na auditoria.

Por segurança, o script **recusa um e-mail que já tenha conta** (para não trocar a senha de alguém sem querer). Se a conta já existir, use `--admin-uid <UID>` no lugar de `--admin-email` e `--admin-nome`.

## 2. Onde fica a senha provisória

A senha **nunca aparece na tela**. Ela é gravada num arquivo só no seu computador:

```
portal/.acesso-inicial.txt
```

- Esse arquivo está no `.gitignore`: **não vai** para o GitHub.
- Abra o arquivo, passe o e-mail e a senha ao síndico **pessoalmente** ou por um canal seguro (não por e-mail).
- **Depois que o síndico trocar a senha, apague o arquivo.**

## 3. O primeiro acesso do síndico

1. Abrir o portal → **Entrar** → quadro **"Equipe do condomínio"**.
2. Digitar o e-mail e a senha provisória.
3. O portal leva direto para a tela **"Trocar senha"** (`/conta/senha`). Enquanto a senha for provisória, nenhuma outra página abre.
4. Digitar a senha provisória, a senha nova (mínimo de **10 caracteres**, diferente da atual) e repetir a nova.
5. Pronto: o portal abre o painel da administração. As sessões antigas (em outros aparelhos) são encerradas.

## 4. Criar o acesso das outras pessoas da equipe (portaria, conselho, administração)

Quem faz: o síndico (ou quem tiver a permissão "Cadastrar portaria, conselho e administração").

1. **Pessoas → Adicionar pessoa** (se a pessoa ainda não estiver cadastrada).
2. Abrir a página da pessoa → cartão **"Entrar com e-mail e senha"** → **"Criar acesso com senha"** (informe o e-mail dela).
3. O portal mostra a senha provisória **uma única vez**, com o botão **Copiar** e o aviso *"Anote agora: esta senha não aparece de novo"*. Entregue a senha à pessoa e clique em **"Já anotei"**.
4. No primeiro acesso, a pessoa é obrigada a trocar a senha (como no passo 3).

Esqueceu a senha? Na mesma página, use **"Gerar nova senha provisória"**. A senha antiga deixa de valer e a pessoa troca de novo no próximo acesso. Tudo fica registrado na auditoria (sem a senha).

Moradores entram de outro jeito (usuário + senha): veja o item 6.

## 5. Trocar a própria senha a qualquer momento

- **Administração / conselho:** no menu lateral, botão com a **chave** ("Trocar senha"). No celular, fica dentro de **Menu**.
- **Portaria:** botão com a **chave** no topo da tela.
- **Morador:** toque em **"Casa 12"** no topo, ou **Mais → Trocar minha senha**.
- Ou abra direto: `/conta/senha`.

Trocar a senha **encerra a sessão em todos os outros aparelhos**.

## 6. Criar o acesso dos MORADORES (usuário + senha pelo WhatsApp)

Quem faz: o síndico (permissão "Cadastrar, alterar e suspender moradores").

1. **Pessoas → Adicionar pessoa** com o perfil **Morador** e a casa (se ainda não estiver cadastrado). Vale cadastrar o **telefone**: assim o WhatsApp já abre na conversa da pessoa.
2. Abrir a página do morador → cartão **"Usuário e senha do morador"** → **"Criar acesso do morador"**.
   (Atalho: na página da **unidade**, cada morador sem acesso tem o botão **"Criar acesso"**.)
3. O portal gera o **usuário** (6 letras/números, ex.: `K7M 4PX`) e uma **senha provisória**, e mostra os dois **uma única vez**, com os botões:
   - **Copiar usuário**, **Copiar senha**, **Copiar tudo (mensagem pronta)**;
   - **Enviar pelo WhatsApp**: abre o WhatsApp com a mensagem pronta (saudação, link do portal, usuário, senha provisória e o aviso de que a pessoa vai escolher a própria senha). Confira a conversa e toque em enviar.
4. Clique em **"Já anotei ou enviei"**.
5. No primeiro acesso, o morador abre o link → **Entrar** → aba **"Sou morador"** → digita o usuário (pode ser em minúsculas, com ou sem espaço) e a senha provisória. O portal **obriga** a escolher a própria senha (mínimo de 10 caracteres). Depois disso, o topo mostra **"Casa 12 · Sair"**.

Esqueceu a senha? Na página do morador, **"Gerar nova senha provisória"**: o usuário continua o mesmo, a senha antiga deixa de valer e a pessoa troca de novo no próximo acesso. Na lista de pessoas, cada morador mostra **"Sem acesso"**, **"Senha provisória"** (ainda não entrou) ou **"Acesso ativo"**.

Morador **suspenso** não entra, mesmo com a senha certa. Tudo fica na auditoria (sem a senha).

> Demonstração no Firebase real: o script `scripts/criar-demo-real.ts` cria o morador demo da Casa 12 com o usuário fixo **`DEMA22`** e a senha de `DEMO_SENHA` (sem troca obrigatória). Link: `/entrar?c=jardins-do-lago-demo`. ("DEMO12" não serve: o usuário não pode ter O nem 1.)

## 7. Mandar o link de acesso aos moradores

O portal **não abre nada sem login**. Em **Configurações → Informações do condomínio** (`/admin/informacoes`) está o **link de acesso dos moradores** (a tela `/entrar`), com os botões **Copiar** e **Enviar pelo WhatsApp**. Cada morador entra com o **usuário e a senha que você cria** (item 6); quem não tiver usuário não vê nenhuma informação.

> O antigo campo `portalPublico` do condomínio (e o script que o ligava) foi retirado. Se ele ainda existir no banco, não tem efeito nenhum.

## Perguntas rápidas

| Situação | O que fazer |
|---|---|
| Perdi o arquivo `.acesso-inicial.txt` antes do primeiro acesso | Se já existe outro administrador, ele gera nova senha provisória na página da pessoa. Se não existe, apague a conta no Firebase Authentication e o condomínio no Firestore e rode o script de novo. |
| O script disse que o e-mail já tem conta | Use `--admin-uid <UID>` com o UID dessa conta (Firebase → Authentication). |
| A pessoa diz "senha incorreta" | A mensagem é a mesma para e-mail (ou usuário) errado e senha errada (de propósito). Confira o e-mail ou o usuário; se precisar, gere nova senha provisória. |
| O morador abriu o link de outro condomínio | O usuário só vale no condomínio dele. O link enviado pelo WhatsApp já leva o condomínio certo (`?c=` quando não é o padrão). |
| Muitas tentativas erradas | O Firebase bloqueia por alguns minutos. Espere e tente de novo. |
