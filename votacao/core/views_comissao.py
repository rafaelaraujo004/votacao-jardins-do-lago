"""Telas da comissão (além dos cadastros do Django Admin)."""
from collections import Counter
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_POST

from . import distribuicao, importacao, limites
from .apuracao import apurar
from .auditoria import auditar
from .models import Auditoria, Casa, Eleicao, Eleitor, Procuracao


def _usuario(request):
    return request.user.get_full_name() or request.user.get_username()


def _base(request, ativo, **ctx):
    eleicao = Eleicao.atual()
    ctx.update(eleicao=eleicao, ativo=ativo, versao=settings.VERSAO_SISTEMA)
    if eleicao:
        ctx.update(status=eleicao.status(), abre=distribuicao.hora_curta(eleicao.abre),
                   fecha=distribuicao.hora_curta(eleicao.fecha), data_longa=distribuicao.data_longa(eleicao.data))
    return ctx


@staff_member_required
def painel(request):
    ctx = _base(request, "painel")
    eleicao = ctx["eleicao"]
    if eleicao:
        votos = list(Eleitor.objects.filter(eleicao=eleicao, votou_em__isnull=False)
                     .select_related("casa").order_by("-votou_em"))
        aptas = Eleitor.objects.filter(eleicao=eleicao).count()
        por_hora = Counter(timezone.localtime(e.votou_em).hour for e in votos)
        horas = list(range(eleicao.abre.hour, eleicao.fecha.hour + (1 if eleicao.fecha.minute else 0)))
        maximo = max([por_hora[h] for h in horas] + [1])
        ctx.update(
            votantes=len(votos), aptas=aptas, faltam=aptas - len(votos),
            pct=(len(votos) / aptas * 100) if aptas else 0,
            barras=[(h, por_hora[h], por_hora[h] / maximo * 100) for h in horas],
            ultimos=votos[:10] if eleicao.comissao_ve_votantes else None,
            bloqueios=limites.total_bloqueios_hoje(),
            alerta_global=limites.falhas_globais_na_hora() >= limites.ALERTA_GLOBAL_POR_HORA,
        )
    return render(request, "comissao/painel.html", ctx)


@staff_member_required
def casas(request):
    ctx = _base(request, "casas")
    eleicao = ctx["eleicao"]
    lista = list(Casa.objects.filter(ativa=True))
    lista.sort(key=lambda c: (len(c.numero), c.numero))
    eleitores = {e.casa_id: e for e in Eleitor.objects.filter(eleicao=eleicao)} if eleicao else {}
    ctx.update(linhas=[(c, eleitores.get(c.pk)) for c in lista],
               bloqueada=bool(eleicao and eleicao.codigos_gerados_em))
    return render(request, "comissao/casas.html", ctx)


def _ordem_casa(numero):
    digitos = "".join(c for c in numero if c.isdigit())
    return (int(digitos) if digitos else 0, numero)


@staff_member_required
def mapa(request):
    """Mapa das casas: quem já votou (casa e horário), nunca o voto."""
    ctx = _base(request, "mapa")
    eleicao = ctx["eleicao"]
    if eleicao:
        eleitores = {e.casa_id: e for e in Eleitor.objects.filter(eleicao=eleicao)}
        casas = sorted(Casa.objects.filter(ativa=True), key=lambda c: _ordem_casa(c.numero))
        grupos = {}
        for c in casas:
            if c.quadra:
                nome = c.quadra
            else:
                inicio = (_ordem_casa(c.numero)[0] - 1) // 20 * 20 + 1
                nome = f"Casas {inicio} a {inicio + 19}"
            e = eleitores.get(c.pk)
            grupos.setdefault(nome, []).append({
                "numero": c.numero,
                "votou": bool(e and e.votou_em),
                "hora": timezone.localtime(e.votou_em).strftime("%H:%M") if e and e.votou_em else "",
            })
        votaram = sum(1 for g in grupos.values() for c in g if c["votou"])
        total = sum(len(g) for g in grupos.values())
        ctx.update(grupos=[{"nome": n, "casas": g, "votaram": sum(1 for c in g if c["votou"])}
                           for n, g in grupos.items()],
                   votaram=votaram, total=total, pct=(votaram / total * 100) if total else 0)
    return render(request, "comissao/mapa.html", ctx)


@staff_member_required
@require_POST
def importar(request):
    eleicao = Eleicao.atual()
    if eleicao and eleicao.codigos_gerados_em:
        messages.error(request, "Os códigos já foram gerados. Para uma casa que faltou, cadastre-a e use “Reemitir código”.")
        return redirect("comissao:casas")
    if "confirmar" in request.POST:
        texto = request.POST.get("conteudo", "")
        lidas, erros, _ = importacao.ler(texto)
        if erros:
            messages.error(request, "O arquivo mudou. Envie de novo.")
            return redirect("comissao:casas")
        Casa.objects.update(ativa=False)
        for c in lidas:
            Casa.objects.update_or_create(numero=c["numero"], defaults={
                "proprietario": c["proprietario"], "telefone": c["telefone"], "quadra": c.get("quadra", ""), "ativa": True})
        auditar(request, "importar_casas", f"Importou a lista de casas: {len(lidas)} casas aptas")
        messages.success(request, f"{len(lidas)} casas importadas.")
        return redirect("comissao:casas")
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        messages.error(request, "Escolha o arquivo CSV.")
        return redirect("comissao:casas")
    texto = importacao.decodificar(arquivo.read())
    lidas, erros, avisos = importacao.ler(texto)
    return render(request, "comissao/importar.html", _base(
        request, "casas", lidas=lidas, erros=erros, avisos=avisos, conteudo=texto, nome=arquivo.name))


@staff_member_required
def codigos(request):
    ctx = _base(request, "codigos")
    eleicao = ctx["eleicao"]
    if eleicao:
        ctx.update(impedimento=distribuicao.pode_gerar(eleicao),
                   total=Eleitor.objects.filter(eleicao=eleicao).count(),
                   reemitidos=Eleitor.objects.filter(eleicao=eleicao, codigo_versao__gt=1).count())
    return render(request, "comissao/codigos.html", ctx)


@staff_member_required
@require_POST
def gerar_codigos(request):
    eleicao = Eleicao.atual()
    impedimento = distribuicao.pode_gerar(eleicao) if eleicao else "Crie a eleição antes."
    if impedimento:
        messages.error(request, impedimento)
        return redirect("comissao:codigos")
    if request.POST.get("confirmacao", "").strip().upper() != "GERAR":
        messages.error(request, "Digite GERAR para confirmar.")
        return redirect("comissao:codigos")
    de_novo = bool(eleicao.codigos_gerados_em)
    pares = distribuicao.gerar_todos(eleicao, _usuario(request))
    auditar(request, "gerar_codigos",
            f"{'Gerou de novo' if de_novo else 'Gerou'} e baixou o arquivo de envio dos códigos ({len(pares)} casas)"
            + (". Os códigos anteriores foram invalidados" if de_novo else ""))
    linhas = []
    for casa, codigo in pares:
        texto = distribuicao.mensagem(eleicao, casa, codigo)
        linhas.append({"casa": casa, "codigo": codigo,
                       "whatsapp": distribuicao.link_whatsapp(casa.telefone, texto) if casa.telefone else None})
    html = render_to_string("comissao/envio_codigos.html", {"eleicao": eleicao, "linhas": linhas,
                                                            "gerado_em": timezone.localtime()})
    resp = HttpResponse(html, content_type="text/html; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="envio-codigos.html"'
    return resp


@sensitive_post_parameters()
@staff_member_required
@require_POST
def reemitir(request):
    eleicao = Eleicao.atual()
    numero = request.POST.get("casa", "").strip().upper()
    motivo = request.POST.get("motivo", "").strip() or "não informado"
    casa = Casa.objects.filter(numero=numero, ativa=True).first()
    if eleicao is None or casa is None:
        messages.error(request, "Não existe casa ativa com esse número.")
        return redirect("comissao:codigos")
    procuracao = Procuracao.objects.filter(eleicao=eleicao, casa=casa).first() if motivo == "Procuração" else None
    if motivo == "Procuração" and not procuracao:
        messages.error(request, "Registre a procuração antes, em Cadastros › Procurações.")
        return redirect("comissao:codigos")
    try:
        codigo = distribuicao.reemitir(eleicao, casa, procuracao)
    except ValueError as e:
        messages.error(request, str(e))
        return redirect("comissao:codigos")
    auditar(request, "reemitir_codigo",
            f"Reemitiu o código da casa {casa.numero} (motivo: {motivo}). O código anterior foi invalidado")
    telefone = procuracao.procurador_telefone if procuracao else casa.telefone
    texto = distribuicao.mensagem(eleicao, casa, codigo)
    ctx = _base(request, "codigos", novo={"casa": casa, "codigo": codigo,
                                          "whatsapp": distribuicao.link_whatsapp(telefone, texto) if telefone else None})
    # Mostrado uma única vez, sem cache.
    return render(request, "comissao/reemitido.html", ctx)


@staff_member_required
@require_POST
def prorrogar(request):
    eleicao = Eleicao.atual()
    if eleicao is None or eleicao.status() != "aberta":
        messages.error(request, "Só dá para prorrogar com a votação aberta.")
        return redirect("comissao:painel")
    motivo = request.POST.get("motivo", "").strip()
    try:
        nova = datetime.strptime(request.POST.get("hora", ""), "%H:%M").time()
    except ValueError:
        nova = None
    limite = (datetime.combine(eleicao.data, eleicao.abre) + timedelta(hours=12)).time()
    if nova is None or nova <= eleicao.fecha:
        messages.error(request, "Escolha um horário depois do encerramento atual.")
    elif nova > limite or nova < eleicao.abre:
        messages.error(request, f"O limite é {distribuicao.hora_curta(limite)}: a votação não pode passar de 12 horas.")
    elif len(motivo) < 5:
        messages.error(request, "Escreva o motivo. Ele vai para a ata.")
    else:
        antes = eleicao.fecha
        Eleicao.objects.filter(pk=eleicao.pk).update(fecha=nova)
        auditar(request, "prorrogar", f"Prorrogou o encerramento de {distribuicao.hora_curta(antes)} para "
                                      f"{distribuicao.hora_curta(nova)} (motivo: {motivo})")
        messages.success(request, f"Encerramento prorrogado para {distribuicao.hora_curta(nova)}.")
    return redirect("comissao:painel")


def _resultado_ctx(request, ativo):
    ctx = _base(request, ativo)
    eleicao = ctx["eleicao"]
    if eleicao and eleicao.status() == "encerrada":
        r = apurar(eleicao)
        r["pct"] = (r["votantes"] / r["aptas"] * 100) if r["aptas"] else 0
        for cargo in r["cargos"]:
            cargo.com_candidato = cargo.cedulas - cargo.brancos
            maximo = max([v for _, v, _ in cargo.ranking] + [1])
            cargo.linhas = [{"c": c, "votos": v, "pos": p, "largura": v / maximo * 100,
                             "vaga": (cargo.eleitos.index(c) + 1) if c in cargo.eleitos else None,
                             "empate": bool(cargo.empate and not cargo.empate["decididos"] and c in cargo.empate["grupo"])}
                            for c, v, p in cargo.ranking]
        ctx["r"] = r
    return ctx


@staff_member_required
def resultado(request):
    ctx = _resultado_ctx(request, "resultado")
    if "r" in ctx:
        auditar(request, "ver_resultado", "Abriu o resultado da apuração")
    return render(request, "comissao/resultado.html", ctx)


@staff_member_required
def ata(request):
    ctx = _resultado_ctx(request, "ata")
    if "r" in ctx:
        auditar(request, "gerar_ata", "Gerou a ata da eleição")
        ctx["membros"] = [u for u in type(request.user).objects.filter(is_staff=True, is_active=True, is_superuser=False)
                          .order_by("first_name")]
    return render(request, "comissao/ata.html", ctx)


@staff_member_required
def auditoria(request):
    return render(request, "comissao/auditoria.html", _base(request, "auditoria", linhas=Auditoria.objects.all()[:500]))
