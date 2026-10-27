# Publicar no PythonAnywhere (grátis, sem domínio)

Leva uns 15 minutos. O link fica `https://NOMEDACONTA.pythonanywhere.com`.
Sugestão de nome de conta: **jardinsdolago** (o link fica `jardinsdolago.pythonanywhere.com`).

## 1. Criar a conta

1. Entre em <https://www.pythonanywhere.com/pricing/> e escolha **Create a Beginner account** (grátis, sem cartão).
2. Use o e-mail do condomínio ou o seu. O nome de usuário vira o endereço do site.

## 2. Criar o web app

1. Aba **Web** › **Add a new web app** › Next.
2. Escolha **Manual configuration** (não escolha "Django") › **Python 3.12** › Next.

## 3. Rodar a instalação (um comando)

Aba **Consoles** › **Bash**. Cole:

```bash
git clone https://github.com/rafaelaraujo004/votacao-jardins-do-lago.git && bash votacao-jardins-do-lago/votacao/deploy/pythonanywhere.sh
```

> O repositório é privado. O `git clone` vai pedir usuário e senha: use `rafaelaraujo004` e, como senha,
> um token do GitHub (GitHub › Settings › Developer settings › Personal access tokens › Fine-grained,
> só leitura deste repositório). Se o repositório ficar público, não pede nada.

O script cria o ambiente, gera os segredos em `~/votacao.env`, prepara o banco e confere o sigilo.

## 4. Três ajustes na aba Web (uma vez só)

1. **Virtualenv**: `/home/NOMEDACONTA/.virtualenvs/votacao`
2. **Force HTTPS**: Enabled
3. Botão verde **Reload**

## 5. Contas da comissão

Num console Bash novo, uma linha por membro (a senha é perguntada sem aparecer na tela):

```bash
votacao criar_membro presidente@email.com "Nome Completo"
```

Depois, cada membro entra em `https://NOMEDACONTA.pythonanywhere.com/comissao/`.

## Atualizar depois de uma correção

```bash
cd ~/votacao-jardins-do-lago && git pull && bash votacao/deploy/pythonanywhere.sh
```

## Cuidados

- **Nunca apague `~/votacao.env`.** Sem o `CODIGO_PEPPER` dele, os códigos enviados param de funcionar.
- O plano grátis desliga o site se ninguém clicar em **"Run until 1 month from today"** na aba Web. Clique antes da votação.
- Não atualize nada entre 7h e 17h do dia da votação.
- Backup do banco (só depois das 17h): aba **Files** › `dados/db.sqlite3` › download.
