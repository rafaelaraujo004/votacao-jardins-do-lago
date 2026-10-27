from django.urls import path

from . import views_comissao as v

app_name = "comissao"
urlpatterns = [
    path("", v.painel, name="painel"),
    path("casas/", v.casas, name="casas"),
    path("casas/importar/", v.importar, name="importar"),
    path("codigos/", v.codigos, name="codigos"),
    path("codigos/gerar/", v.gerar_codigos, name="gerar"),
    path("codigos/reemitir/", v.reemitir, name="reemitir"),
    path("prorrogar/", v.prorrogar, name="prorrogar"),
    path("resultado/", v.resultado, name="resultado"),
    path("ata/", v.ata, name="ata"),
    path("auditoria/", v.auditoria, name="auditoria"),
]
