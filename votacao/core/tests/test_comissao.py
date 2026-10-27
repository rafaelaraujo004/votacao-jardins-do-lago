from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from core import importacao, limites
from core.apuracao import apurar
from core.models import Auditoria, Candidato, Cedula, Eleitor

from .base import criar_eleicao, votar


class ComissaoTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("presidente@exemplo.com", password="senha-segura-123", is_staff=True,
                                             first_name="Helena")
        self.user.user_permissions.set([])

    def test_paginas_exigem_login(self):
        for url in ["/comissao/", "/comissao/casas/", "/comissao/codigos/", "/comissao/resultado/", "/comissao/ata/"]:
            r = self.client.get(url)
            self.assertEqual(r.status_code, 302, url)
            self.assertIn("/comissao/admin/login/", r["Location"])

    def test_resultado_bloqueado_antes_do_fim(self):
        eleicao, cargo, cands, cods = criar_eleicao()
        votar(self.client, cods["1"], cargo, [cands[0]])
        self.client.force_login(self.user)
        r = self.client.get("/comissao/resultado/")
        self.assertContains(r, "O resultado só aparece depois do encerramento")
        self.assertNotContains(r, cands[0].nome)

    def test_resultado_e_empate(self):
        eleicao, cargo, cands, cods = criar_eleicao(casas=6)
        for casa, cand in [("1", 0), ("2", 0), ("3", 1), ("4", 2), ("5", 3)]:
            votar(self.client, cods[casa], cargo, [cands[cand]])
        votar(self.client, cods["6"], cargo, [], branco=True)
        r = apurar(eleicao)
        c = r["cargos"][0]
        self.assertTrue(r["confere"])
        self.assertEqual(c.brancos, 1)
        self.assertEqual(c.ranking[0][0], cands[0])
        self.assertIsNotNone(c.empate)  # 3ª vaga: candidatos 1, 2 e 3 com 1 voto cada
        self.assertEqual(c.empate["vaga"], 2)

    def test_auditoria_nao_pode_ser_alterada_nem_apagada(self):
        a = Auditoria.objects.create(usuario="x", acao="teste", descricao="linha")
        with self.assertRaises(IntegrityError), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("UPDATE core_auditoria SET descricao='mudou' WHERE id=%s", [a.pk])
        with self.assertRaises(IntegrityError), transaction.atomic():
            Auditoria.objects.filter(pk=a.pk).delete()

    def test_gerar_codigos_baixa_arquivo_e_audita(self):
        eleicao, *_ = criar_eleicao(casas=3, aberta=False)
        Eleitor.objects.all().delete()
        self.client.force_login(self.user)
        r = self.client.post("/comissao/codigos/gerar/", {"confirmacao": "GERAR"})
        self.assertEqual(r["Content-Disposition"], 'attachment; filename="envio-codigos.html"')
        self.assertContains(r, "https://wa.me/5511999990000?text=")
        self.assertEqual(Eleitor.objects.count(), 3)
        self.assertTrue(Auditoria.objects.filter(acao="gerar_codigos").exists())

    def test_gerar_codigos_bloqueado_com_votacao_aberta(self):
        criar_eleicao(casas=2)
        self.client.force_login(self.user)
        r = self.client.post("/comissao/codigos/gerar/", {"confirmacao": "GERAR"}, follow=True)
        self.assertContains(r, "A votação já começou")

    def test_candidato_travado_depois_de_abrir(self):
        eleicao, cargo, cands, _ = criar_eleicao()
        self.assertTrue(eleicao.travada)
        admin_user = User.objects.create_superuser("root@exemplo.com", password="senha-segura-123")
        self.client.force_login(admin_user)
        r = self.client.post(f"/comissao/admin/core/candidato/{cands[0].pk}/change/",
                             {"cargo": cargo.pk, "numero": 99, "nome": "Mudou"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Candidato.objects.get(pk=cands[0].pk).nome, cands[0].nome)

    def test_limite_por_ip(self):
        criar_eleicao()
        for _ in range(limites.LIMITE_IP):
            self.client.post("/", {"codigo": "ZZZZZZZZ"}, REMOTE_ADDR="10.0.0.1")
        r = self.client.post("/", {"codigo": "ZZZZZZZZ"}, REMOTE_ADDR="10.0.0.1")
        self.assertContains(r, "Muitas tentativas erradas")
        r = self.client.post("/", {"codigo": "YYYYYYYY"}, REMOTE_ADDR="10.0.0.2")
        self.assertContains(r, "Não encontramos este código")


class ImportacaoTests(TestCase):
    def test_csv_do_excel_brasileiro(self):
        conteudo = "Casa;Proprietário;Telefone\r\n1;José da Silva;(11) 98765-4321\r\n2;Ana;\r\n2;Repetida;11999998888\r\n3;Rui;98765-4321\r\n".encode("cp1252")
        texto = importacao.decodificar(conteudo)
        casas, erros, avisos = importacao.ler(texto)
        self.assertEqual([c["numero"] for c in casas], ["1", "2"])
        self.assertEqual(casas[0]["telefone"], "5511987654321")
        self.assertEqual(casas[0]["proprietario"], "José da Silva")
        self.assertEqual(len(avisos), 1)  # casa 2 sem telefone
        self.assertEqual(len(erros), 2)   # casa 2 repetida e telefone sem DDD

    def test_utf8_com_bom_e_virgula(self):
        texto = importacao.decodificar("﻿casa,nome,telefone\n10A,Lúcia,+55 11 91234-5678\n".encode("utf-8"))
        casas, erros, _ = importacao.ler(texto)
        self.assertEqual(casas, [{"numero": "10A", "proprietario": "Lúcia", "telefone": "5511912345678"}])
        self.assertEqual(erros, [])
