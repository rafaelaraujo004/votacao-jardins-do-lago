# Primeiro acesso: criar o administrador e trocar senhas

Este guia explica, passo a passo, como o primeiro administrador (o síndico) passa a entrar no portal **de verdade**, e como cada pessoa da equipe troca a própria senha.

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

Moradores ainda **não** entram com senha: o método de login deles está em aberto (veja `docs/FASES.md`).

## 5. Trocar a própria senha a qualquer momento

- **Administração / conselho:** no menu lateral, botão com a **chave** ("Trocar senha"). No celular, fica dentro de **Menu**.
- **Portaria:** botão com a **chave** no topo da tela.
- Ou abra direto: `/conta/senha`.

Trocar a senha **encerra a sessão em todos os outros aparelhos**.

## Perguntas rápidas

| Situação | O que fazer |
|---|---|
| Perdi o arquivo `.acesso-inicial.txt` antes do primeiro acesso | Se já existe outro administrador, ele gera nova senha provisória na página da pessoa. Se não existe, apague a conta no Firebase Authentication e o condomínio no Firestore e rode o script de novo. |
| O script disse que o e-mail já tem conta | Use `--admin-uid <UID>` com o UID dessa conta (Firebase → Authentication). |
| A pessoa diz "senha incorreta" | A mensagem é a mesma para e-mail errado e senha errada (de propósito). Confira o e-mail; se precisar, gere nova senha provisória. |
| Muitas tentativas erradas | O Firebase bloqueia por alguns minutos. Espere e tente de novo. |
