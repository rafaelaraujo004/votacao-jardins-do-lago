"""Voto duplo: 20 confirmações simultâneas com o mesmo código geram 1 voto."""
import threading

from django.db import connection
from django.test import TransactionTestCase

from core.models import Cedula, Eleitor
from core.votacao import VotoRecusado, emitir_token, registrar_voto

from .base import criar_eleicao


class ConcorrenciaTests(TransactionTestCase):
    def test_vinte_cliques_simultaneos_um_voto(self):
        eleicao, cargo, cands, _ = criar_eleicao(casas=1)
        token = emitir_token(Eleitor.objects.get())
        resultados, barreira = [], threading.Barrier(20)

        def clicar():
            barreira.wait()
            try:
                registrar_voto(eleicao, token, {cargo.pk: [cands[0].pk]})
                resultados.append("ok")
            except VotoRecusado as e:
                resultados.append(e.motivo)
            finally:
                connection.close()

        threads = [threading.Thread(target=clicar) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(resultados.count("ok"), 1, resultados)
        self.assertEqual(Cedula.objects.count(), 1)

    def test_falha_ao_gravar_cedula_desfaz_o_ja_votou(self):
        eleicao, cargo, cands, _ = criar_eleicao(casas=1)
        token = emitir_token(Eleitor.objects.get())
        from unittest import mock
        with mock.patch("core.votacao.Cedula.objects.create", side_effect=RuntimeError("disco cheio")):
            with self.assertRaises(RuntimeError):
                registrar_voto(eleicao, token, {cargo.pk: [cands[0].pk]})
        self.assertIsNone(Eleitor.objects.get().votou_em)
        self.assertEqual(Cedula.objects.count(), 0)
