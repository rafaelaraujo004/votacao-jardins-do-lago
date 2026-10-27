from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Comissão · Residencial Jardins do Lago"
admin.site.site_title = "Comissão Jardins do Lago"
admin.site.index_title = "Cadastros da eleição"

urlpatterns = [
    path("comissao/admin/", admin.site.urls),
    path("comissao/", include("core.urls_comissao")),
    path("", include("core.urls_voto")),
]
