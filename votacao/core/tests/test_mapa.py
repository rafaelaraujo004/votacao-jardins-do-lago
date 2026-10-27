from django.contrib.auth.models import User
from django.test import TestCase

from core import importacao
from core.models import Casa

from .base import criar_eleicao, votar


class MapaTests(TestCase):
    def setUp(self):
        self.eleicao, self.cargo, self.cands, self.cods = criar_eleicao(casas=25)
        self.user = User.objects.create_user("membro@exemplo.com", password="senha-segura-123", is_staff=True)

    def test_exige_login(self):
        r = self.client.get("/comissao/mapa/")
        self.assertEqual(r.status_code, 302)

    def test_mostra_quem_votou_sem_mostrar_o_voto(self):
        votar(self.client, self.cods["7"], self.cargo, [self.cands[2]])
        self.client.force_login(self.user)
        r = self.client.get("/comissao/mapa/")
        self.assertContains(r, 'class="lote votou" data-casa="7"')
        self.assertContains(r, 'class="lote" data-casa="8"')
        self.assertNotContains(r, self.cands[2].nome)
        self.assertContains(r, "Casas 1 a 20")
        self.assertContains(r, "Casas 21 a 40")

    def test_agrupa_por_quadra_quando_informada(self):
        Casa.objects.filter(numero__in=["1", "2"]).update(quadra="Rua das Flores")
        self.client.force_login(self.user)
        r = self.client.get("/comissao/mapa/")
        self.assertContains(r, "Rua das Flores")

    def test_respeita_a_regra_de_nao_ver_votantes(self):
        self.eleicao.comissao_ve_votantes = False
        self.eleicao.save()
        votar(self.client, self.cods["3"], self.cargo, [self.cands[0]])
        self.client.force_login(self.user)
        r = self.client.get("/comissao/mapa/")
        self.assertContains(r, "Mapa desligado nesta eleição")
        self.assertNotContains(r, 'data-casa="3"')

    def test_csv_com_coluna_quadra(self):
        casas, erros, _ = importacao.ler("casa;nome;telefone;quadra\n5;Ana;11999998888;Quadra B\n")
        self.assertEqual(erros, [])
        self.assertEqual(casas[0]["quadra"], "Quadra B")
