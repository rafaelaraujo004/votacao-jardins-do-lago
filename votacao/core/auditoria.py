from .models import Auditoria


def ip_da_requisicao(request):
    from django.conf import settings
    if request is None:
        return ""
    if settings.IP_HEADER:
        valor = request.META.get("HTTP_" + settings.IP_HEADER.upper().replace("-", "_"))
        if valor:
            return valor.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def auditar(request, acao, descricao, usuario=None):
    """Grava uma ação administrativa. Nunca chame com o conteúdo de um voto."""
    if usuario is None:
        user = getattr(request, "user", None)
        usuario = (user.get_full_name() or user.get_username()) if user and user.is_authenticated else "Sistema"
    Auditoria.objects.create(usuario=usuario, acao=acao, descricao=descricao, ip=ip_da_requisicao(request))
