"""Códigos de votação: 8 letras, sem O e sem I (não se confundem com 0 e 1).

Só letras, para o morador não precisar trocar para o teclado numérico.
24^8 ≈ 1,1 × 10^11 combinações. No banco fica só o HMAC com um segredo do
servidor: a busca é feita pelo código, sem saber a casa, e uma cópia do banco
sozinha não permite descobrir códigos.
"""
import hashlib
import hmac
import secrets
import unicodedata

from django.conf import settings

ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ"
TAMANHO = 8


def gerar():
    return "".join(secrets.choice(ALFABETO) for _ in range(TAMANHO))


def normalizar(texto):
    sem_acento = unicodedata.normalize("NFD", str(texto or "")).upper()
    return "".join(c for c in sem_acento if "A" <= c <= "Z")[:TAMANHO]


def formatar(codigo):
    return f"{codigo[:4]}-{codigo[4:]}" if len(codigo) > 4 else codigo


def hash_codigo(codigo):
    return hmac.new(settings.CODIGO_PEPPER.encode(), normalizar(codigo).encode(), hashlib.sha256).hexdigest()


def valido(codigo):
    return len(codigo) == TAMANHO and all(c in ALFABETO for c in codigo)
