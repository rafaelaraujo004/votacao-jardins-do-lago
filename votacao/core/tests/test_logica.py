"""Testes das correções da auditoria de lógica."""
import base64
from datetime import date, time, timedelta

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from core import importacao, limites
from core.apuracao import apurar_cargo
from core.models import Candidato, Casa, Cedula, Eleicao, Eleitor
from core.votacao import VotoRecusado, emitir_token, registrar_voto

from .base import criar_eleicao, votar


class DesempateTests(TestCase):
    def _empate(self, regra, datas):
        """Candidatos 0 e 1 com 2 votos; 2 e 3 empatados com 1 voto na 3ª vaga."""
        eleicao, cargo, cands, cods = criar_eleicao(casas=6)
        for cand, d in zip(cands[2:4], datas):
            setattr(cand, "nascimento" if regra == "idade" else "inscrito_em", d)
            cand.save()
        for casa, i in [("1", 0), ("2", 0), ("3", 1), ("4", 1), ("5", 2), ("6", 3)]:
            votar(self.client, cods[casa], cargo, [cands[i]])
        return apurar_cargo(cargo, regra), cands

    def test_idade_decide_quando_ha_datas_diferentes(self):
        r, cands = self._empate("idade", [date(1970, 1, 1), date(1950, 1, 1)])
        self.assertEqual(r.empate["decididos"], [cands[3]])
        self.assertIn(cands[3], r.eleitos)
        self.assertNotIn(cands[2], r.eleitos)

    def test_sem_data_cadastrada_nao_decide(self):
        r, cands = self._empate("idade", [date(1970, 1, 1), None])
        self.assertIsNone(r.empate["decididos"])
        self.assertEqual(len(r.eleitos), 2)  # a 3ª vaga fica para a comissão decidir

    def test_datas_iguais_nao_decide(self):
        r, _ = self._empate("inscricao", [date(2026, 10, 5), date(2026, 10, 5)])
        self.assertIsNone(r.empate["decididos"])

    def test_sorteio_nunca_decide_sozinho(self):
        r, _ = self._empate("sorteio", [None, None])
        self.assertIsNone(r.empate["decididos"])


class LimitePorCodigoTests(TestCase):
    def test_variacoes_do_mesmo_codigo_contam_juntas(self):
        criar_eleicao()
        variacoes = ["zzzz-zzzz", "ZZZZ ZZZZ", "zZzZzZzZ", " ZZZZ-ZZZZ "]
        for i in range(limites.LIMITE_CODIGO):
            self.client.post("/", {"codigo": variacoes[i % 4]}, REMOTE_ADDR=f"10.1.0.{i}")
        r = self.client.post("/", {"codigo": "zzzzzzzz"}, REMOTE_ADDR="10.9.9.9")
        self.assertContains(r, "Muitas tentativas erradas")


class EleicaoAtivaTests(TestCase):
    def test_nao_ativa_outra_com_votacao_aberta(self):
        real, *_ = criar_eleicao(casas=1)
        with self.assertRaises(ValidationError):
            Eleicao.objects.create(titulo="Ensaio", data=timezone.localdate() + timedelta(days=3), ativa=True)
        self.assertEqual(Eleicao.atual(), real)

    def test_pode_criar_inativa_durante_a_votacao(self):
        real, *_ = criar_eleicao(casas=1)
        Eleicao.objects.create(titulo="Próxima", data=timezone.localdate() + timedelta(days=30), ativa=False)
        self.assertEqual(Eleicao.atual(), real)

    def test_depois_de_encerrada_pode_ativar_outra(self):
        criar_eleicao(casas=1, encerrada=True)
        nova = Eleicao.objects.create(titulo="Geral", data=timezone.localdate() + timedelta(days=30), ativa=True)
        self.assertEqual(Eleicao.atual(), nova)


class SemEleicaoTests(TestCase):
    def test_confirmar_sem_eleicao_ativa_nao_quebra(self):
        eleicao, cargo, cands, _ = criar_eleicao(casas=1)
        token = emitir_token(Eleitor.objects.get())
        Eleicao.objects.update(ativa=False)
        r = self.client.post("/votar/confirmar", {"token": token, "acao": "confirmar", f"c{cargo.pk}": [str(cands[0].pk)]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Cedula.objects.count(), 0)

    def test_revisar_depois_de_encerrar_e_recusado(self):
        eleicao, cargo, cands, cods = criar_eleicao(casas=1)
        r = self.client.post("/", {"codigo": cods["1"]})
        token = r.context["token"]
        Eleicao.objects.filter(pk=eleicao.pk).update(data=timezone.localdate() - timedelta(days=1))
        r = self.client.post("/votar/revisar", {"token": token, f"c{cargo.pk}": [str(cands[0].pk)]})
        self.assertContains(r, "A votação foi encerrada")


class CasaProtegidaTests(TestCase):
    def test_casa_com_codigo_nao_pode_ser_apagada(self):
        criar_eleicao(casas=2)
        admin = User.objects.create_superuser("root@exemplo.com", password="senha-segura-123")
        self.client.force_login(admin)
        casa = Casa.objects.get(numero="1")
        r = self.client.post(f"/comissao/admin/core/casa/{casa.pk}/delete/", {"post": "yes"})
        self.assertEqual(r.status_code, 403)
        self.assertTrue(Casa.objects.filter(pk=casa.pk).exists())
        self.assertEqual(Eleitor.objects.count(), 2)

    def test_apagar_em_lote_com_casa_que_tem_codigo_e_recusado(self):
        criar_eleicao(casas=1)
        Casa.objects.create(numero="999", proprietario="Sem código")
        admin = User.objects.create_superuser("root@exemplo.com", password="senha-segura-123")
        self.client.force_login(admin)
        self.client.post("/comissao/admin/core/casa/", {
            "action": "delete_selected", "_selected_action": [c.pk for c in Casa.objects.all()], "post": "yes"})
        self.assertTrue(Casa.objects.filter(numero="1").exists())
        self.assertEqual(Eleitor.objects.count(), 1)

    def test_casa_sem_codigo_pode_ser_apagada(self):
        sem_codigo = Casa.objects.create(numero="999", proprietario="Sem código")
        admin = User.objects.create_superuser("root@exemplo.com", password="senha-segura-123")
        self.client.force_login(admin)
        self.client.post(f"/comissao/admin/core/casa/{sem_codigo.pk}/delete/", {"post": "yes"})
        self.assertFalse(Casa.objects.filter(pk=sem_codigo.pk).exists())


class ProrrogarTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("p@exemplo.com", password="senha-segura-123", is_staff=True)

    def _prorrogar(self, abre, fecha, agora, hora):
        """Votação de hoje entre abre e fecha, com o relógio parado em `agora`."""
        from datetime import datetime
        from unittest import mock
        e, *_ = criar_eleicao(casas=1)
        Eleicao.objects.filter(pk=e.pk).update(abre=abre, fecha=fecha)
        instante = timezone.make_aware(datetime.combine(timezone.localdate(), agora))
        with mock.patch("django.utils.timezone.now", return_value=instante):
            self.client.force_login(self.user)  # sessão criada no mesmo relógio parado
            r = self.client.post("/comissao/prorrogar/", {"hora": hora, "motivo": "sistema fora do ar"}, follow=True)
            self.ultimas = [str(m) for m in r.context["messages"]] if r.context else []
        return Eleicao.objects.get(pk=e.pk).fecha

    def test_abertura_a_tarde_aceita_prorrogar_ate_meia_noite(self):
        self.assertEqual(self._prorrogar(time(13, 0), time(23, 0), time(15, 0), "23:30"), time(23, 30), self.ultimas)

    def test_nao_passa_de_12_horas(self):
        self.assertEqual(self._prorrogar(time(7, 0), time(17, 0), time(10, 0), "19:30"), time(17, 0))

    def test_prorrogar_dentro_do_limite(self):
        self.assertEqual(self._prorrogar(time(7, 0), time(17, 0), time(10, 0), "18:30"), time(18, 30))


class ImportacaoTests(TestCase):
    def test_cabecalhos_comuns_sao_ignorados(self):
        for cab in ["Nº;Proprietário;Celular", "Número da casa;Nome;WhatsApp", "N°;Morador;Fone"]:
            casas, erros, _ = importacao.ler(cab + "\n1;Ana;11999998888\n")
            self.assertEqual(erros, [], cab)
            self.assertEqual(len(casas), 1, cab)

    def test_sem_cabecalho_le_a_primeira_linha(self):
        casas, erros, _ = importacao.ler("1;Ana;11999998888\n2;Rui;11999997777\n")
        self.assertEqual([c["numero"] for c in casas], ["1", "2"])

    def test_confirmacao_preserva_as_linhas(self):
        user = User.objects.create_user("p@exemplo.com", password="senha-segura-123", is_staff=True)
        self.client.force_login(user)
        csv = "casa;nome;telefone\r\n1;Ana;11999998888\r\n2;José;\r\n"
        r = self.client.post("/comissao/casas/importar/", {"arquivo": _arquivo(csv)})
        conteudo = r.context["conteudo"]
        self.assertEqual(base64.b64decode(conteudo).decode("utf-8"), csv)
        self.client.post("/comissao/casas/importar/", {"confirmar": "1", "conteudo": conteudo})
        self.assertEqual(sorted(Casa.objects.filter(ativa=True).values_list("numero", flat=True)), ["1", "2"])

    def test_confirmacao_com_conteudo_invalido_nao_apaga_casas(self):
        user = User.objects.create_user("p@exemplo.com", password="senha-segura-123", is_staff=True)
        self.client.force_login(user)
        Casa.objects.create(numero="7", proprietario="Existente")
        self.client.post("/comissao/casas/importar/", {"confirmar": "1", "conteudo": "!!!não é base64"})
        self.assertTrue(Casa.objects.get(numero="7").ativa)


class PendenciasTests(TestCase):
    def test_painel_avisa_cargo_sem_candidatos_e_codigos(self):
        from core.models import Cargo
        e = Eleicao.objects.create(titulo="Nova", data=timezone.localdate() + timedelta(days=5))
        Cargo.objects.create(eleicao=e, titulo="Conselho", vagas=3)
        user = User.objects.create_user("p@exemplo.com", password="senha-segura-123", is_staff=True)
        self.client.force_login(user)
        r = self.client.get("/comissao/")
        textos = [str(m) for m in r.context["messages"]]
        self.assertTrue(any("não tem candidatos" in t for t in textos), textos)
        self.assertTrue(any("códigos ainda não foram gerados" in t for t in textos), textos)


def _arquivo(texto):
    from django.core.files.uploadedfile import SimpleUploadedFile
    return SimpleUploadedFile("casas.csv", texto.encode("utf-8"), content_type="text/csv")
