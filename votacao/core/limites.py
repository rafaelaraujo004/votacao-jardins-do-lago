"""Limite de tentativas erradas, contra força bruta.

Por IP o limite é generoso: operadoras usam CGNAT e muitos moradores saem pelo
mesmo IP do Wi-Fi do condomínio. Só tentativas que falharam são contadas.
"""
import hashlib
from datetime import timedelta

from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .models import Tentativa

JANELA = timedelta(minutes=15)
LIMITE_IP = 20
LIMITE_CODIGO = 10
LIMITE_LOGIN = 5
ALERTA_GLOBAL_POR_HORA = 300


def _h(valor):
    return hashlib.sha256((settings.CODIGO_PEPPER + str(valor)).encode()).hexdigest()[:40]


def _janela(agora, tamanho):
    inicio = int(agora.timestamp() // tamanho.total_seconds() * tamanho.total_seconds())
    return timezone.datetime.fromtimestamp(inicio, tz=timezone.get_current_timezone())


def _contagem(chave, tamanho=JANELA):
    janela = _janela(timezone.now(), tamanho)
    t = Tentativa.objects.filter(chave=chave, janela=janela).first()
    return t.contagem if t else 0


def _somar(chave, tamanho=JANELA):
    janela = _janela(timezone.now(), tamanho)
    obj, criado = Tentativa.objects.get_or_create(chave=chave, janela=janela, defaults={"contagem": 1})
    if not criado:
        Tentativa.objects.filter(pk=obj.pk).update(contagem=F("contagem") + 1)


def bloqueado(ip, codigo=None):
    if _contagem("ip:" + _h(ip)) >= LIMITE_IP:
        return True
    return bool(codigo) and _contagem("cod:" + _h(codigo)) >= LIMITE_CODIGO


def registrar_falha(ip, codigo=None):
    _somar("ip:" + _h(ip))
    if codigo:
        _somar("cod:" + _h(codigo))
    _somar("global", timedelta(hours=1))


def login_bloqueado(ip, email):
    return _contagem("login:" + _h(email.lower())) >= LIMITE_LOGIN or _contagem("loginip:" + _h(ip)) >= LIMITE_IP


def registrar_falha_login(ip, email):
    _somar("login:" + _h(email.lower()))
    _somar("loginip:" + _h(ip))


def falhas_globais_na_hora():
    return _contagem("global", timedelta(hours=1))


def total_bloqueios_hoje():
    hoje = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    return Tentativa.objects.filter(chave__startswith="ip:", janela__gte=hoje, contagem__gte=LIMITE_IP).count()
