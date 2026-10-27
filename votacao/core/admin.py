"""Cadastros pelo Django Admin, com auditoria e travas.

Eleitor e Cedula não são registrados aqui: ninguém vê, pelo painel, a lista de
cédulas nem os hashes dos códigos.
"""
from django.contrib import admin, messages
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.dispatch import receiver

from . import limites
from .auditoria import auditar, ip_da_requisicao
from .models import Auditoria, Candidato, Cargo, Casa, Eleicao, Procuracao


def _eleicao_de(obj):
    if isinstance(obj, Eleicao):
        return obj
    if isinstance(obj, Cargo):
        return obj.eleicao
    if isinstance(obj, Candidato):
        return obj.cargo.eleicao
    return None


class AuditadoAdmin(admin.ModelAdmin):
    """Grava na auditoria cada inclusão, alteração e exclusão."""

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        campos = ", ".join(form.changed_data) if change else ""
        auditar(request, "alterar" if change else "incluir",
                f"{'Alterou' if change else 'Incluiu'} {obj._meta.verbose_name} “{obj}”" + (f" ({campos})" if campos else ""))

    def delete_model(self, request, obj):
        auditar(request, "excluir", f"Excluiu {obj._meta.verbose_name} “{obj}”")
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            auditar(request, "excluir", f"Excluiu {obj._meta.verbose_name} “{obj}”")
        super().delete_queryset(request, queryset)


class TravadoAdmin(AuditadoAdmin):
    """Depois que a votação abre, regras e candidatos não mudam."""

    def _travado(self, obj):
        e = _eleicao_de(obj) if obj else None
        return bool(e and e.travada)

    def has_change_permission(self, request, obj=None):
        return super().has_change_permission(request, obj) and not self._travado(obj)

    def has_delete_permission(self, request, obj=None):
        return super().has_delete_permission(request, obj) and not self._travado(obj)

    def change_view(self, request, object_id, form_url="", extra_context=None):
        obj = self.get_object(request, object_id)
        if obj and self._travado(obj):
            messages.info(request, "Travado: a votação já abriu. Para emergência, use “Prorrogar o encerramento” no painel.")
        return super().change_view(request, object_id, form_url, extra_context)


class CargoInline(admin.StackedInline):
    model = Cargo
    extra = 0
    fields = ("titulo", "vagas", "max_escolhas", "permite_branco")

    def has_change_permission(self, request, obj=None):
        return not (obj and obj.travada)

    has_add_permission = has_delete_permission = has_change_permission


@admin.register(Eleicao)
class EleicaoAdmin(TravadoAdmin):
    list_display = ("titulo", "data", "abre", "fecha", "ativa", "eh_teste")
    inlines = [CargoInline]
    fieldsets = [
        (None, {"fields": ("titulo", "data", ("abre", "fecha"), "ativa", "eh_teste")}),
        ("Regras", {"fields": ("comissao_ve_votantes", "regra_desempate")}),
        ("WhatsApp", {"fields": ("mensagem_whatsapp",)}),
    ]


class CandidatoInline(admin.TabularInline):
    model = Candidato
    extra = 0
    fields = ("numero", "nome", "casa", "inscrito_em", "nascimento")

    def has_change_permission(self, request, obj=None):
        return not (obj and obj.eleicao.travada)

    has_add_permission = has_delete_permission = has_change_permission


@admin.register(Cargo)
class CargoAdmin(TravadoAdmin):
    list_display = ("titulo", "eleicao", "vagas", "max_escolhas", "permite_branco")
    inlines = [CandidatoInline]


@admin.register(Candidato)
class CandidatoAdmin(TravadoAdmin):
    list_display = ("numero", "nome", "casa", "cargo", "inscrito_em")
    list_filter = ("cargo",)


@admin.register(Casa)
class CasaAdmin(AuditadoAdmin):
    list_display = ("numero", "proprietario", "telefone", "quadra", "ativa")
    search_fields = ("numero", "proprietario")
    list_filter = ("ativa", "quadra")


@admin.register(Procuracao)
class ProcuracaoAdmin(AuditadoAdmin):
    list_display = ("casa", "procurador_nome", "eleicao", "registrada_por", "registrada_em")

    def save_model(self, request, obj, form, change):
        if not change:
            obj.registrada_por = request.user.get_full_name() or request.user.get_username()
        super().save_model(request, obj, form, change)


@admin.register(Auditoria)
class AuditoriaAdmin(admin.ModelAdmin):
    list_display = ("quando", "usuario", "descricao", "ip")
    list_filter = ("acao",)
    search_fields = ("descricao", "usuario")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# ---- login da comissão: auditoria e limite de tentativas ----
@receiver(user_logged_in)
def _login_ok(sender, request, user, **kwargs):
    auditar(request, "login", "Entrou no painel da comissão", usuario=user.get_full_name() or user.get_username())


@receiver(user_login_failed)
def _login_falhou(sender, credentials, request=None, **kwargs):
    email = (credentials or {}).get("username", "")
    limites.registrar_falha_login(ip_da_requisicao(request), email)
    auditar(request, "login_falha", f"Tentativa de login com senha errada ({email})", usuario="—")


_login_original = admin.site.login


def _login_com_limite(request, extra_context=None):
    if request.method == "POST":
        email = request.POST.get("username", "")
        if limites.login_bloqueado(ip_da_requisicao(request), email):
            from django.shortcuts import render
            return render(request, "admin/bloqueado.html", status=429)
    return _login_original(request, extra_context)


admin.site.login = _login_com_limite
