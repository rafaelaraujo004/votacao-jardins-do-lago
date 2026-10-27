"""Contagem dos votos e regra de desempate."""
from dataclasses import dataclass, field

from .models import Cedula, Eleitor


@dataclass
class ResultadoCargo:
    cargo: object
    ranking: list = field(default_factory=list)  # [(candidato, votos, posicao)]
    eleitos: list = field(default_factory=list)
    brancos: int = 0
    cedulas: int = 0
    empate: dict = None


def _desempatar(grupo, campo, restantes):
    """Ordena os empatados pela data da regra (a mais antiga primeiro).

    Só decide se todos têm a data cadastrada e se ela separa quem fica de quem
    sai. Senão devolve None e a comissão decide, registrando na ata: o sistema
    nunca escolhe por um critério que não seja a regra.
    """
    if any(getattr(c, campo) is None for c in grupo):
        return None
    ordem = sorted(grupo, key=lambda c: getattr(c, campo))
    if getattr(ordem[restantes - 1], campo) == getattr(ordem[restantes], campo):
        return None
    return ordem


def apurar_cargo(cargo, regra):
    votos = {c.pk: 0 for c in cargo.candidatos.all()}
    brancos = cedulas = 0
    for escolhas in Cedula.objects.filter(cargo=cargo).values_list("escolhas", flat=True):
        cedulas += 1
        if escolhas == Cedula.BRANCO:
            brancos += 1
            continue
        for pk in escolhas.split(","):
            if int(pk) in votos:
                votos[int(pk)] += 1
    cands = sorted(cargo.candidatos.all(), key=lambda c: (-votos[c.pk], c.numero))
    ranking = [(c, votos[c.pk], 1 + sum(1 for v in votos.values() if v > votos[c.pk])) for c in cands]
    r = ResultadoCargo(cargo=cargo, ranking=ranking, brancos=brancos, cedulas=cedulas)
    vagas = cargo.vagas
    r.eleitos = [c for c, _, _ in ranking[:vagas]]
    if len(ranking) > vagas and ranking[vagas - 1][1] == ranking[vagas][1] and ranking[vagas][1] > 0:
        v = ranking[vagas - 1][1]
        grupo = [c for c, n, _ in ranking if n == v]
        acima = [c for c, n, _ in ranking if n > v]
        restantes = vagas - len(acima)
        ordem = None
        campo = {"idade": "nascimento", "inscricao": "inscrito_em"}.get(regra)
        if campo:
            ordem = _desempatar(grupo, campo, restantes)
        r.empate = {"grupo": grupo, "votos": v, "vaga": len(acima) + 1,
                    "decididos": ordem[:restantes] if ordem else None}
        r.eleitos = acima + (ordem[:restantes] if ordem else [])
    return r


def apurar(eleicao):
    votantes = Eleitor.objects.filter(eleicao=eleicao, votou_em__isnull=False).count()
    cargos = [apurar_cargo(c, eleicao.regra_desempate) for c in eleicao.cargos.prefetch_related("candidatos")]
    confere = all(c.cedulas == votantes for c in cargos)
    return {"votantes": votantes, "aptas": eleicao.eleitores.count(), "cargos": cargos, "confere": confere}
