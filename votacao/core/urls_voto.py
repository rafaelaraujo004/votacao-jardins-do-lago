from django.urls import path

from . import views_voto

app_name = "voto"
urlpatterns = [
    path("", views_voto.entrar, name="entrar"),
    path("votar/revisar", views_voto.revisar, name="revisar"),
    path("votar/confirmar", views_voto.confirmar, name="confirmar"),
    path("votar/obrigado", views_voto.sucesso, name="sucesso"),
    path("participacao/", views_voto.participacao, name="participacao"),
]
