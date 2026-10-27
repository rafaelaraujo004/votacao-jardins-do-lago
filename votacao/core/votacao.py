"""Regras do voto. A gravação acontece numa transação só."""
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone

from . import codigos
from .models import Cedula, Eleitor

SAL_TOKEN = "voto-jardins"
VALIDADE_TOKEN = 60 * 60  # 60 minutos entre digitar o código e confirmar


class VotoRecusado(Exception):
    def __init__(self, motivo, casa=None):
        super().__init__(motivo)
        self.motivo = motivo
        self.casa = casa


def emitir_token(eleitor):
    return signing.dumps({"e": eleitor.pk, "v": eleitor.codigo_versao}, salt=SAL_TOKEN)


def ler_token(token):
    try:
        dados = signing.loads(token, salt=SAL_TOKEN, max_age=VALIDADE_TOKEN)
        return int(dados["e"]), int(dados["v"])
    except (signing.BadSignature, KeyError, TypeError, ValueError):
        raise VotoRecusado("expirado")


def validar_codigo(eleicao, texto):
    """Confere o código digitado. Devolve o Eleitor ou levanta VotoRecusado."""
    status = eleicao.status()
    if status == "antes":
        raise VotoRecusado("antes")
    if status == "encerrada":
        raise VotoRecusado("encerrada")
    codigo = codigos.normalizar(texto)
    if not codigos.valido(codigo):
        raise VotoRecusado("formato")
    eleitor = Eleitor.objects.select_related("casa").filter(
        eleicao=eleicao, codigo_hash=codigos.hash_codigo(codigo)).first()
    if eleitor is None:
        raise VotoRecusado("naoencontrado")
    if eleitor.votou_em is not None:
        raise VotoRecusado("usado", casa=eleitor.casa.numero)
    return eleitor


def validar_escolhas(eleicao, dados):
    """dados: {cargo_id: lista de ids de candidato ou "BRANCO"}.

    Devolve {cargo: texto canônico da cédula}. Toda validação é no servidor.
    """
    resultado = {}
    for cargo in eleicao.cargos.prefetch_related("candidatos"):
        escolha = dados.get(cargo.pk)
        if escolha == Cedula.BRANCO:
            if not cargo.permite_branco:
                raise VotoRecusado("invalido")
            resultado[cargo] = Cedula.BRANCO
            continue
        ids = sorted(set(escolha or []))
        validos = {c.pk for c in cargo.candidatos.all()}
        if not ids or len(ids) != len(escolha or []) or len(ids) > cargo.max_escolhas or not set(ids) <= validos:
            raise VotoRecusado("invalido")
        resultado[cargo] = ",".join(str(i) for i in ids)
    if not resultado:
        raise VotoRecusado("invalido")
    return resultado


def registrar_voto(eleicao, token, dados):
    """Marca "já votou" e grava as cédulas juntos, ou nada é gravado."""
    eleitor_id, versao = ler_token(token)
    with transaction.atomic():  # BEGIN IMMEDIATE (ver settings)
        if eleicao.status() != "aberta":
            raise VotoRecusado("encerrada" if eleicao.status() == "encerrada" else "antes")
        cedulas = validar_escolhas(eleicao, dados)
        marcados = Eleitor.objects.filter(
            pk=eleitor_id, eleicao=eleicao, votou_em__isnull=True, codigo_versao=versao,
        ).update(votou_em=timezone.now())
        if marcados != 1:
            eleitor = Eleitor.objects.filter(pk=eleitor_id).select_related("casa").first()
            if eleitor and eleitor.codigo_versao != versao:
                raise VotoRecusado("trocado")
            raise VotoRecusado("usado", casa=eleitor.casa.numero if eleitor else None)
        for cargo, escolhas in cedulas.items():
            for _ in range(5):  # colisão do id sorteado é praticamente impossível
                try:
                    with transaction.atomic():
                        Cedula.objects.create(cargo=cargo, escolhas=escolhas)
                    break
                except IntegrityError:
                    continue
            else:
                raise RuntimeError("não foi possível gravar a cédula")
