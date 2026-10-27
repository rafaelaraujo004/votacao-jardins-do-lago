"""Testes que a comissão pode ver rodar: a urna não permite ligar voto a casa."""
import logging

from django.contrib.sessions.models import Session
from django.db import connection
from django.test import TestCase

from core.models import Cedula, Eleitor

from .base import criar_eleicao, votar


class SigiloTests(TestCase):
    def setUp(self):
        self.eleicao, self.cargo, self.cands, self.cods = criar_eleicao(casas=50)

    def test_urna_so_tem_id_cargo_e_escolhas(self):
        self.assertEqual([f.column for f in Cedula._meta.fields], ["id", "cargo_id", "escolhas"])

    def test_chave_da_cedula_e_o_proprio_rowid(self):
        with connection.cursor() as c:
            c.execute("SELECT sql FROM sqlite_master WHERE name='core_cedula'")
            self.assertIn('"id" integer NOT NULL PRIMARY KEY', c.fetchone()[0])

    def test_sqlite_sem_wal_e_com_secure_delete(self):
        with connection.cursor() as c:
            c.execute("PRAGMA journal_mode")
            self.assertEqual(c.fetchone()[0].lower(), "delete")
            c.execute("PRAGMA secure_delete")
            self.assertEqual(c.fetchone()[0], 1)

    def test_ordem_da_urna_nao_segue_a_ordem_dos_votos(self):
        # 50 casas votam em ordem conhecida; cada uma num candidato diferente em sequência.
        ordem = []
        for i in range(1, 51):
            cand = self.cands[i % 5]
            votar(self.client, self.cods[str(i)], self.cargo, [cand])
            ordem.append(str(cand.pk))
        with connection.cursor() as c:
            c.execute("SELECT rowid, escolhas FROM core_cedula ORDER BY rowid")
            fisica = [e for _, e in c.fetchall()]
        self.assertEqual(sorted(fisica), sorted(ordem))
        # A ordem física (rowid) é embaralhada: quase nenhuma cédula fica na posição em que chegou.
        no_lugar = sum(1 for a, b in zip(fisica, ordem) if a == b)
        self.assertLess(no_lugar, 25)
        self.assertEqual(Cedula.objects.values("id").distinct().count(), 50)

    def test_votar_nao_cria_sessao_nem_loga_escolha(self):
        with self.assertLogs(level=logging.DEBUG) as logs:
            logging.getLogger("teste").debug("início")
            votar(self.client, self.cods["1"], self.cargo, [self.cands[3]])
        texto = "\n".join(logs.output)
        self.assertNotIn(self.cands[3].nome, texto)
        self.assertNotIn(f"c{self.cargo.pk}", texto)
        self.assertEqual(Session.objects.count(), 0)

    def test_escolha_nunca_vai_na_url(self):
        r = self.client.post("/", {"codigo": self.cods["2"]})
        html = r.content.decode()
        self.assertIn('action="/votar/revisar"', html)
        self.assertIn('method="post"', html)

    def test_cedulas_igual_votantes(self):
        for i in range(1, 11):
            votar(self.client, self.cods[str(i)], self.cargo, [self.cands[0]])
        self.assertEqual(Cedula.objects.count(), Eleitor.objects.filter(votou_em__isnull=False).count())
