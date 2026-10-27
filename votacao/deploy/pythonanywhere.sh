#!/usr/bin/env bash
# Instala ou atualiza o sistema de votação numa conta do PythonAnywhere.
# Rode num console Bash de lá, depois de criar o web app (Web › Add a new web app ›
# Manual configuration › Python 3.12):
#     bash ~/votacao-jardins-do-lago/votacao/deploy/pythonanywhere.sh
# Pode rodar de novo a cada atualização: não apaga dados nem troca os segredos.
set -euo pipefail

USUARIO="$(whoami)"
DOMINIO="${USUARIO}.pythonanywhere.com"
PROJETO="$HOME/votacao-jardins-do-lago/votacao"
VENV="$HOME/.virtualenvs/votacao"
ENV_FILE="$HOME/votacao.env"
DADOS="$HOME/dados"
WSGI="/var/www/${USUARIO}_pythonanywhere_com_wsgi.py"

echo "== Votação Jardins do Lago · instalação em https://${DOMINIO}"
cd "$PROJETO"
mkdir -p "$DADOS"

if [ ! -d "$VENV" ]; then
  echo "-- Criando o ambiente Python 3.12"
  python3.12 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r requirements.txt

if [ ! -f "$ENV_FILE" ]; then
  echo "-- Criando $ENV_FILE com segredos novos"
  gerar() { "$VENV/bin/python" -c 'import secrets; print(secrets.token_urlsafe(50))'; }
  cat > "$ENV_FILE" <<EOF
# Configurações do sistema de votação. NÃO apague: sem o CODIGO_PEPPER os códigos enviados param de funcionar.
DJANGO_SECRET_KEY=$(gerar)
CODIGO_PEPPER=$(gerar)
DJANGO_ALLOWED_HOSTS=${DOMINIO}
DJANGO_CSRF_TRUSTED_ORIGINS=https://${DOMINIO}
SITE_URL=https://${DOMINIO}
IP_HEADER=X-Real-IP
DADOS_DIR=${DADOS}
VERSAO_SISTEMA=v1.0-piloto
TELEFONE_COMISSAO=
EOF
  chmod 600 "$ENV_FILE"
fi

echo "-- Banco de dados e arquivos estáticos"
"$VENV/bin/python" manage.py migrate --noinput
"$VENV/bin/python" manage.py collectstatic --noinput -v0
"$VENV/bin/python" manage.py checar_sigilo

if [ -f "$WSGI" ]; then
  echo "-- Gravando $WSGI"
  cat > "$WSGI" <<EOF
import os, sys
sys.path.insert(0, "${PROJETO}")
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
EOF
else
  echo "!! Não achei $WSGI. Crie o web app (Manual configuration, Python 3.12) e rode este script de novo."
  exit 1
fi

# Atalho para os comandos de gestão: votacao criar_membro ..., votacao checar_sigilo
if ! grep -q "alias votacao=" "$HOME/.bashrc" 2>/dev/null; then
  echo "alias votacao='cd $PROJETO && $VENV/bin/python manage.py'" >> "$HOME/.bashrc"
fi

touch "$WSGI"  # recarrega o site
cat <<EOF

== Pronto.
Falta, uma única vez, na aba Web do PythonAnywhere:
  1. Virtualenv: ${VENV}
  2. Force HTTPS: Enabled
  3. Botão verde Reload
Depois crie as contas da comissão (num console novo):
  votacao criar_membro email@exemplo.com "Nome Completo"
Site: https://${DOMINIO}   ·   Comissão: https://${DOMINIO}/comissao/
EOF
