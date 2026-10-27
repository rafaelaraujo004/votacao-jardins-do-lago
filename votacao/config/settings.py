"""Configurações da plataforma de votação.

Tudo que é segredo ou muda entre ambientes vem de variáveis de ambiente.
Em desenvolvimento (DJANGO_DEBUG=1) há valores padrão inseguros só para rodar localmente.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _carregar_arquivo_env():
    """No PythonAnywhere as configurações ficam em ~/votacao.env (CHAVE=valor por linha)."""
    caminho = Path(os.environ.get("VOTACAO_ENV_FILE", Path.home() / "votacao.env"))
    if not caminho.is_file():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip())


_carregar_arquivo_env()

DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"


def _segredo(nome, padrao_dev):
    valor = os.environ.get(nome)
    if valor:
        return valor
    if DEBUG:
        return padrao_dev
    raise RuntimeError(f"Defina a variável de ambiente {nome}.")


SECRET_KEY = _segredo("DJANGO_SECRET_KEY", "dev-inseguro-nao-use-em-producao")
# Segredo usado no HMAC dos códigos de votação. Fica fora do banco: uma cópia do
# banco sozinha não permite descobrir códigos.
CODIGO_PEPPER = _segredo("CODIGO_PEPPER", "dev-pepper-inseguro")

ALLOWED_HOSTS = [h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if o]

# Endereço público usado nas mensagens do WhatsApp.
SITE_URL = os.environ.get("SITE_URL", "http://localhost:8000").rstrip("/")
# Cabeçalho com o IP real do eleitor, posto pelo proxy da hospedagem (Fly.io: Fly-Client-IP).
IP_HEADER = os.environ.get("IP_HEADER", "")
TELEFONE_COMISSAO = os.environ.get("TELEFONE_COMISSAO", "")
VERSAO_SISTEMA = os.environ.get("VERSAO_SISTEMA", "dev")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.CabecalhosSeguranca",
]
# Sem GZipMiddleware de propósito: compressão faz o tamanho da resposta variar
# com o conteúdo, e o log de acesso registra esse tamanho.

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DADOS_DIR = Path(os.environ.get("DADOS_DIR", BASE_DIR))
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DADOS_DIR / "db.sqlite3",
        "OPTIONS": {
            # IMMEDIATE trava a escrita no início da transação: dois cliques
            # simultâneos no mesmo código não geram dois votos.
            "transaction_mode": "IMMEDIATE",
            "timeout": 20,
            # Sigilo: sem WAL (ele guarda as páginas alteradas de cada voto) e
            # apagando de verdade o conteúdo removido.
            "init_command": "PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON;",
        },
        # Banco de testes em arquivo, para o teste de concorrência com threads.
        "TEST": {"NAME": str(BASE_DIR / "test_db.sqlite3")},
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        if DEBUG else "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "admin:login"
SESSION_COOKIE_AGE = 4 * 60 * 60  # sessões da comissão: 4 horas
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_FAILURE_VIEW = "core.views_voto.falha_csrf"
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"  # "no-referrer" faz o navegador mandar Origin: null e o CSRF recusa

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False

# Logs sem corpo de requisição. Sem ADMINS: o e-mail de erro do Django inclui o
# POST, que teria a escolha do voto.
ADMINS = []
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {"django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False}},
}
