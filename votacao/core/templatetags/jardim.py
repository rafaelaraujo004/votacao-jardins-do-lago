"""Filtros de apresentação: iniciais e cor de pétala para cada candidato."""
from django import template

register = template.Library()

PALAVRAS_MENORES = {"da", "de", "do", "das", "dos", "e"}


@register.filter
def iniciais(nome):
    partes = [p for p in str(nome).split() if p.lower() not in PALAVRAS_MENORES]
    if not partes:
        return "?"
    if len(partes) == 1:
        return partes[0][:2].upper()
    return (partes[0][0] + partes[-1][0]).upper()


@register.filter
def petala(numero):
    """Uma das 6 cores das pétalas da logo, fixa para cada número de candidato."""
    try:
        return int(numero) % 6 + 1
    except (TypeError, ValueError):
        return 1
