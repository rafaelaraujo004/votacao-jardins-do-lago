"""Telas do morador: entrar, escolher, confirmar e mensagem final.

Sigilo nestas telas:
- a escolha só trafega no corpo de POST, nunca na URL (que vai para os logs);
- nada de request.session nem messages (gravariam uma linha com horário);
- a página de revisão tem tamanho fixo (o log registra os bytes enviados);
- sensitive_post_parameters esconde código e escolhas de qualquer relatório de erro.
"""
from django.http import HttpResponse
from django.shortcuts import redirect, render
from django.template.loader import render_to_string
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.http import require_http_methods, require_POST

from . import limites
from .auditoria import ip_da_requisicao
from .distribuicao import data_longa, hora_curta
from .models import Candidato, Cedula, Eleicao, Eleitor
from .votacao import VotoRecusado, emitir_token, ler_token, registrar_voto, validar_codigo, validar_escolhas

TAMANHO_FIXO = 40_000  # bytes da página de revisão, sempre iguais

MENSAGENS = {
    "formato": ("danger", "O código tem 8 letras", "Confira a mensagem do WhatsApp e digite as 8 letras."),
    "naoencontrado": ("danger", "Não encontramos este código",
                      "Confira as letras e tente de novo. Se a mensagem sumiu, a comissão pode mandar um código novo."),
    "usado": ("warn", "Este código já foi usado", "A casa {casa} já votou. Se não foi você, procure a comissão."),
    "antes": ("info", "A votação ainda não começou", "Ela abre {data}, às {abre}."),
    "encerrada": ("info", "A votação foi encerrada", "Encerrou às {fecha}. Obrigado pela participação."),
    "bloqueado": ("danger", "Muitas tentativas erradas", "Aguarde 15 minutos e tente de novo."),
    "trocado": ("warn", "Este código foi trocado",
                "A comissão emitiu um código novo para esta casa. Use o código da mensagem mais recente."),
    "expirado": ("warn", "O tempo para votar acabou", "Por segurança, digite o código de novo."),
    "invalido": ("danger", "Escolha não aceita", "Confira a sua escolha e tente de novo."),
}


def _ctx(eleicao, **extra):
    ctx = {"eleicao": eleicao}
    if eleicao:
        ctx.update(status=eleicao.status(), data_longa=data_longa(eleicao.data),
                   abre=hora_curta(eleicao.abre), fecha=hora_curta(eleicao.fecha))
    ctx.update(extra)
    return ctx


def _erro(eleicao, motivo, casa=None):
    tom, titulo, texto = MENSAGENS.get(motivo, MENSAGENS["invalido"])
    if eleicao:
        texto = texto.format(casa=casa or "", data=data_longa(eleicao.data),
                             abre=hora_curta(eleicao.abre), fecha=hora_curta(eleicao.fecha))
    return {"tom": tom, "titulo": titulo, "texto": texto}


@sensitive_post_parameters("codigo")
@require_http_methods(["GET", "POST"])
def entrar(request):
    eleicao = Eleicao.atual()
    if eleicao is None:
        return render(request, "voto/sem_eleicao.html")
    erro = None
    if request.method == "POST":
        ip = ip_da_requisicao(request)
        texto = request.POST.get("codigo", "")
        if limites.bloqueado(ip, texto):
            erro = _erro(eleicao, "bloqueado")
        else:
            try:
                eleitor = validar_codigo(eleicao, texto)
            except VotoRecusado as e:
                if e.motivo in ("formato", "naoencontrado", "usado"):
                    limites.registrar_falha(ip, texto)
                erro = _erro(eleicao, e.motivo, e.casa)
            else:
                return _tela_escolher(request, eleicao, eleitor, emitir_token(eleitor))
    return render(request, "voto/entrar.html", _ctx(eleicao, erro=erro))


def _tela_escolher(request, eleicao, eleitor, token, selecionados=None, erro=None):
    selecionados = selecionados or {}
    cargos = []
    for cargo in eleicao.cargos.prefetch_related("candidatos"):
        marcado = selecionados.get(cargo.pk)
        ids = marcado if isinstance(marcado, list) else []
        cargos.append({
            "obj": cargo, "multi": cargo.max_escolhas > 1, "branco": marcado == Cedula.BRANCO,
            "candidatos": [(c, c.pk in ids) for c in cargo.candidatos.all()],
        })
    return render(request, "voto/escolher.html", _ctx(
        eleicao, casa=eleitor.casa.numero, token=token, cargos=cargos,
        selecionados=selecionados or {}, erro=erro))


def _ler_escolhas(request, eleicao):
    dados = {}
    for cargo in eleicao.cargos.all():
        if request.POST.get(f"b{cargo.pk}") == "1":
            dados[cargo.pk] = Cedula.BRANCO
        else:
            try:
                dados[cargo.pk] = [int(v) for v in request.POST.getlist(f"c{cargo.pk}") if v and v != "00"]
            except ValueError:
                dados[cargo.pk] = None
    return dados


def _eleitor_do_token(eleicao, token):
    eleitor_id, versao = ler_token(token)
    eleitor = Eleitor.objects.select_related("casa").filter(pk=eleitor_id, eleicao=eleicao).first()
    if eleitor is None:
        raise VotoRecusado("expirado")
    if eleitor.codigo_versao != versao:
        raise VotoRecusado("trocado")
    if eleitor.votou_em is not None:
        raise VotoRecusado("usado", casa=eleitor.casa.numero)
    return eleitor


@sensitive_post_parameters()
@require_POST
def revisar(request):
    eleicao = Eleicao.atual()
    token = request.POST.get("token", "")
    try:
        eleitor = _eleitor_do_token(eleicao, token)
    except VotoRecusado as e:
        return render(request, "voto/entrar.html", _ctx(eleicao, erro=_erro(eleicao, e.motivo, e.casa)))
    dados = _ler_escolhas(request, eleicao)
    if request.POST.get("acao") == "voltar":
        return _tela_escolher(request, eleicao, eleitor, token, selecionados=dados)
    try:
        cedulas = validar_escolhas(eleicao, dados)
    except VotoRecusado:
        return _tela_escolher(request, eleicao, eleitor, token, selecionados=dados,
                              erro={"tom": "warn", "titulo": "Falta escolher",
                                    "texto": "Escolha um candidato ou toque em “Votar em branco”."})
    resumo = []
    for cargo, escolhas in cedulas.items():
        if escolhas == Cedula.BRANCO:
            resumo.append((cargo, [], True, ["00"] * cargo.max_escolhas))
        else:
            ids = [int(i) for i in escolhas.split(",")]
            cands = list(Candidato.objects.filter(pk__in=ids).order_by("numero"))
            # campos ocultos sempre com o mesmo número de posições
            campos = [str(i) for i in ids] + ["00"] * (cargo.max_escolhas - len(ids))
            resumo.append((cargo, cands, False, campos))
    html = render_to_string("voto/confirmar.html", _ctx(
        eleicao, casa=eleitor.casa.numero, token=token, resumo=resumo), request=request)
    return _tamanho_fixo(html)


def _tamanho_fixo(html):
    corpo = html.encode("utf-8")
    falta = TAMANHO_FIXO - len(corpo)
    if falta > 8:
        corpo += b"<!--" + b" " * (falta - 7) + b"-->"
    return HttpResponse(corpo, content_type="text/html; charset=utf-8")


@sensitive_post_parameters()
@require_POST
def confirmar(request):
    eleicao = Eleicao.atual()
    token = request.POST.get("token", "")
    try:
        if request.POST.get("acao") == "voltar":
            eleitor = _eleitor_do_token(eleicao, token)
            return _tela_escolher(request, eleicao, eleitor, token, selecionados=_ler_escolhas(request, eleicao))
        registrar_voto(eleicao, token, _ler_escolhas(request, eleicao))
    except VotoRecusado as e:
        return render(request, "voto/entrar.html", _ctx(eleicao, erro=_erro(eleicao, e.motivo, e.casa)))
    return redirect("voto:sucesso")


def sucesso(request):
    # Mesma página para todos: não repete o voto nem a casa.
    return render(request, "voto/sucesso.html", _ctx(Eleicao.atual()))


def falha_csrf(request, reason=""):
    return render(request, "voto/expirou.html", _ctx(Eleicao.atual()), status=403)
