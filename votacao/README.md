# Sistema de votação · Residencial Jardins do Lago

Django 5.2 + SQLite. Morador vota com o código de 8 letras recebido no WhatsApp; a comissão usa e-mail e senha.

## Rodar no computador

```bash
cd votacao
.venv/Scripts/python.exe -m pip install -r requirements.txt   # primeira vez (crie o .venv com Python 3.12)
export DJANGO_DEBUG=1
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py runserver
```

Conta de teste **só local** (criada para os testes, não existe em produção):
`dev@jardinsdolago.local` / `ensaio-local-2026`.

## Comandos

| Comando | Para quê |
|---|---|
| `manage.py test core` | 36 testes: voto, janela, voto duplo com 20 cliques simultâneos, sigilo, comissão, importação |
| `manage.py criar_membro email "Nome Completo"` | Cria a conta de um membro da comissão (pergunta a senha) |
| `manage.py criar_eleicao_teste --casas 220` | Ensaio aberto agora, com códigos de teste em `loadtest/codigos-teste.json` |
| `python loadtest/carga.py URL --paralelo 40` | Todas as casas do ensaio votam ao mesmo tempo |
| `manage.py apagar_eleicao ID` | Apaga o ensaio com tudo dele e faz VACUUM |
| `manage.py checar_sigilo` | Mostra à comissão as garantias de sigilo no banco real |

## Como o sigilo é garantido

- `Eleitor` (quem votou: casa e horário) e `Cedula` (a urna: só as escolhas) não têm coluna em comum.
- A chave da cédula é um inteiro aleatório declarado `integer primary key`: no SQLite ele é o próprio rowid, então a ordem física é sorteada e não a de chegada.
- Marcar "já votou" e gravar a cédula acontecem na mesma transação `BEGIN IMMEDIATE`.
- SQLite sem WAL (`journal_mode=DELETE`) e com `secure_delete=ON`.
- A escolha só trafega em POST; a revisão tem sempre 40.000 bytes; sem sessão, `messages`, Sentry, analytics ou fontes externas; `sensitive_post_parameters` nas telas de voto; sem `ADMINS`.
- No banco, o código é guardado só como HMAC-SHA256 com o segredo `CODIGO_PEPPER`, que fica fora do banco.
- Auditoria só aceita acréscimos (gatilhos no banco bloqueiam UPDATE e DELETE).

## Publicar

**Agora: PythonAnywhere grátis, sem domínio.** Passo a passo em `deploy/PUBLICAR.md`.

### Alternativa: Fly.io (precisa de cartão)

```bash
fly launch --no-deploy --copy-config          # usa o fly.toml daqui
fly volumes create dados --region gru --size 1 --scheduled-snapshots=false
fly secrets set DJANGO_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(50))')" \
                CODIGO_PEPPER="$(python -c 'import secrets;print(secrets.token_urlsafe(50))')" \
                VERSAO_SISTEMA="v1.0-piloto" TELEFONE_COMISSAO="(xx) xxxxx-xxxx"
fly deploy
fly scale count 1                              # sempre 1 máquina
fly ssh console -C "python manage.py criar_membro email@exemplo.com 'Nome'"
```

Guarde o `CODIGO_PEPPER` com cuidado: se ele mudar depois do envio, todos os códigos param de funcionar.
**Não faça deploy entre 7h e 17h do dia da votação.**
