"""Geração, envio e reemissão dos códigos.

O código em texto só existe na memória e no arquivo de envio entregue uma vez.
No banco fica apenas o hash.
"""
from urllib.parse import quote

from django.conf import settings
from django.db import transaction
from django.utils import formats, timezone

from . import codigos
from .models import Casa, Eleitor

DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def hora_curta(t):
    return f"{t.hour}h{t.minute:02d}" if t.minute else f"{t.hour}h"


def data_longa(d):
    return f"{DIAS[d.weekday()]}, {d.day} de {formats.date_format(d, 'F').lower()}"


def link_voto(codigo):
    return f"{settings.SITE_URL}/#{codigos.formatar(codigo)}"


def mensagem(eleicao, casa, codigo):
    nome = (casa.proprietario.split() or [""])[0]
    return (eleicao.mensagem_whatsapp
            .replace("{nome}", nome).replace("{casa}", casa.numero)
            .replace("{codigo}", codigos.formatar(codigo))
            .replace("{data}", data_longa(eleicao.data))
            .replace("{abre}", hora_curta(eleicao.abre)).replace("{fecha}", hora_curta(eleicao.fecha))
            .replace("{link}", link_voto(codigo)))


def link_whatsapp(telefone, texto):
    return f"https://wa.me/{telefone}?text={quote(texto)}"


def _novo_codigo_unico():
    while True:
        c = codigos.gerar()
        h = codigos.hash_codigo(c)
        if not Eleitor.objects.filter(codigo_hash=h).exists():
            return c, h


def pode_gerar(eleicao):
    if eleicao.status() != "antes":
        return "A votação já começou. Não é possível gerar os códigos de novo."
    if Eleitor.objects.filter(eleicao=eleicao, votou_em__isnull=False).exists():
        return "Já existem votos nesta eleição."
    if not Casa.objects.filter(ativa=True).exists():
        return "Importe a lista de casas antes."
    return None


def gerar_todos(eleicao, usuario):
    """Gera um código para cada casa ativa. Devolve [(casa, codigo)] para o arquivo de envio."""
    agora = timezone.now()
    saida = []
    with transaction.atomic():
        Eleitor.objects.filter(eleicao=eleicao).delete()
        for casa in Casa.objects.filter(ativa=True).order_by("numero"):
            c, h = _novo_codigo_unico()
            Eleitor.objects.create(eleicao=eleicao, casa=casa, codigo_hash=h, codigo_emitido_em=agora)
            saida.append((casa, c))
        eleicao.codigos_gerados_em = agora
        eleicao.codigos_gerados_por = usuario
        eleicao.save(update_fields=["codigos_gerados_em", "codigos_gerados_por"])
    saida.sort(key=lambda par: (len(par[0].numero), par[0].numero))
    return saida


def reemitir(eleicao, casa, procuracao=None):
    """Troca o código de uma casa (ou cria, se a casa entrou depois). O antigo deixa de valer."""
    if eleicao.status() == "encerrada":
        raise ValueError("A votação já foi encerrada.")
    c, h = _novo_codigo_unico()
    with transaction.atomic():
        eleitor = Eleitor.objects.filter(eleicao=eleicao, casa=casa).first()
        if eleitor and eleitor.votou_em:
            raise ValueError(f"A casa {casa.numero} já votou. Não é possível emitir outro código.")
        if eleitor is None:
            eleitor = Eleitor(eleicao=eleicao, casa=casa, codigo_versao=0)
        eleitor.codigo_hash = h
        eleitor.codigo_versao += 1
        eleitor.codigo_emitido_em = timezone.now()
        eleitor.enviado_para = "procurador" if procuracao else "proprietario"
        eleitor.procuracao = procuracao
        eleitor.save()
    return c
