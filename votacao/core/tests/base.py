from datetime import time, timedelta

from django.utils import timezone

from core import codigos
from core.models import Candidato, Cargo, Casa, Eleicao, Eleitor


def criar_eleicao(casas=10, max_escolhas=1, branco=True, aberta=True, encerrada=False):
    # Janelas por dia (ontem / hoje / amanhã): funcionam a qualquer hora, até perto da meia-noite.
    hoje = timezone.localdate()
    if encerrada:
        data, abre, fecha = hoje - timedelta(days=1), time(7), time(17)
    elif aberta:
        data, abre, fecha = hoje, time(0, 0), time(23, 59)
    else:
        data, abre, fecha = hoje + timedelta(days=1), time(7), time(17)
    eleicao = Eleicao.objects.create(titulo="Eleição de teste", data=data, abre=abre, fecha=fecha, ativa=True)
    cargo = Cargo.objects.create(eleicao=eleicao, vagas=3, max_escolhas=max_escolhas, permite_branco=branco)
    cands = [Candidato.objects.create(cargo=cargo, numero=11 + i, nome=f"Candidato {i}") for i in range(5)]
    cods = {}
    for n in range(1, casas + 1):
        casa = Casa.objects.create(numero=str(n), proprietario=f"Proprietário {n}", telefone="5511999990000")
        c = codigos.gerar()
        Eleitor.objects.create(eleicao=eleicao, casa=casa, codigo_hash=codigos.hash_codigo(c),
                               codigo_emitido_em=timezone.now())
        cods[str(n)] = c
    return eleicao, cargo, cands, cods


def votar(client, codigo, cargo, escolhas, branco=False):
    """Percorre as 3 telas. Devolve a resposta final."""
    r = client.post("/", {"codigo": codigo})
    token = r.context["token"]
    dados = {"token": token}
    if branco:
        dados[f"b{cargo.pk}"] = "1"
    else:
        dados[f"c{cargo.pk}"] = [str(c.pk) for c in escolhas]
    client.post("/votar/revisar", dados)
    dados["acao"] = "confirmar"
    return client.post("/votar/confirmar", dados)
