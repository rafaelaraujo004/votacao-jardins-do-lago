from django.test import TestCase

from core import codigos
from core.models import Cedula, Eleitor
from core.votacao import emitir_token

from .base import criar_eleicao, votar


class VotoTests(TestCase):
    def setUp(self):
        self.eleicao, self.cargo, self.cands, self.cods = criar_eleicao()

    def test_caminho_feliz_um_candidato(self):
        r = votar(self.client, self.cods["1"], self.cargo, [self.cands[2]])
        self.assertRedirects(r, "/votar/obrigado")
        self.assertEqual(Cedula.objects.get().escolhas, str(self.cands[2].pk))
        self.assertIsNotNone(Eleitor.objects.get(casa__numero="1").votou_em)

    def test_tela_final_nao_repete_o_voto(self):
        votar(self.client, self.cods["1"], self.cargo, [self.cands[2]])
        r = self.client.get("/votar/obrigado")
        self.assertContains(r, "Voto registrado com sucesso")
        self.assertNotContains(r, self.cands[2].nome)
        self.assertNotContains(r, "Casa 1")

    def test_codigo_aceita_minusculas_espacos_e_hifen(self):
        c = self.cods["2"].lower()
        r = self.client.post("/", {"codigo": f" {c[:4]} - {c[4:]} "})
        self.assertEqual(r.context["casa"], "2")

    def test_codigo_inexistente_e_formato(self):
        r = self.client.post("/", {"codigo": "ABCDEFGH"})
        self.assertContains(r, "Não encontramos este código")
        r = self.client.post("/", {"codigo": "ABC"})
        self.assertContains(r, "O código tem 8 letras")

    def test_codigo_usado(self):
        votar(self.client, self.cods["3"], self.cargo, [self.cands[0]])
        r = self.client.post("/", {"codigo": self.cods["3"]})
        self.assertContains(r, "Este código já foi usado")
        self.assertContains(r, "A casa 3 já votou")

    def test_voto_em_branco(self):
        votar(self.client, self.cods["4"], self.cargo, [], branco=True)
        self.assertEqual(Cedula.objects.get().escolhas, Cedula.BRANCO)

    def test_branco_proibido(self):
        self.cargo.permite_branco = False
        self.cargo.save()
        r = votar(self.client, self.cods["4"], self.cargo, [], branco=True)
        self.assertEqual(Cedula.objects.count(), 0)
        self.assertIn(r.status_code, (200,))

    def test_servidor_recusa_mais_escolhas_que_o_permitido(self):
        e = Eleitor.objects.get(casa__numero="5")
        token = emitir_token(e)
        r = self.client.post("/votar/confirmar", {"token": token, "acao": "confirmar",
                                                   f"c{self.cargo.pk}": [str(self.cands[0].pk), str(self.cands[1].pk)]})
        self.assertContains(r, "Escolha não aceita")
        self.assertEqual(Cedula.objects.count(), 0)
        self.assertIsNone(Eleitor.objects.get(pk=e.pk).votou_em)

    def test_servidor_recusa_candidato_de_outro_cargo(self):
        e = Eleitor.objects.get(casa__numero="5")
        r = self.client.post("/votar/confirmar", {"token": emitir_token(e), "acao": "confirmar",
                                                   f"c{self.cargo.pk}": ["999999"]})
        self.assertContains(r, "Escolha não aceita")
        self.assertEqual(Cedula.objects.count(), 0)

    def test_token_adulterado(self):
        r = self.client.post("/votar/confirmar", {"token": "lixo", "acao": "confirmar",
                                                   f"c{self.cargo.pk}": [str(self.cands[0].pk)]})
        self.assertContains(r, "O tempo para votar acabou")

    def test_codigo_reemitido_invalida_o_antigo_e_o_token(self):
        from core.distribuicao import reemitir
        e = Eleitor.objects.get(casa__numero="6")
        token = emitir_token(e)
        novo = reemitir(self.eleicao, e.casa)
        r = self.client.post("/", {"codigo": self.cods["6"]})
        self.assertContains(r, "Não encontramos este código")
        r = self.client.post("/votar/confirmar", {"token": token, "acao": "confirmar",
                                                   f"c{self.cargo.pk}": [str(self.cands[0].pk)]})
        self.assertContains(r, "Este código foi trocado")
        self.assertEqual(votar(self.client, novo, self.cargo, [self.cands[0]]).status_code, 302)

    def test_reemitir_bloqueado_depois_de_votar(self):
        from core.distribuicao import reemitir
        votar(self.client, self.cods["7"], self.cargo, [self.cands[0]])
        with self.assertRaises(ValueError):
            reemitir(self.eleicao, Eleitor.objects.get(casa__numero="7").casa)

    def test_codigo_nunca_tem_letras_confusas(self):
        for _ in range(500):
            c = codigos.gerar()
            self.assertEqual(len(c), 8)
            self.assertFalse(set(c) & set("OI01"))

    def test_revisao_tem_tamanho_fixo(self):
        tamanhos = set()
        for casa, cand in (("8", self.cands[0]), ("9", self.cands[4])):
            r = self.client.post("/", {"codigo": self.cods[casa]})
            rv = self.client.post("/votar/revisar", {"token": r.context["token"], f"c{self.cargo.pk}": [str(cand.pk)]})
            tamanhos.add(len(rv.content))
        self.assertEqual(len(tamanhos), 1)

    def test_revisao_tem_o_mesmo_tamanho_para_todos_os_votos(self):
        # Inclui um nome bem mais longo e o voto em branco: nenhum muda o tamanho da resposta.
        self.cands[1].nome = "Maria Aparecida de Albuquerque Cavalcanti Rodrigues Junqueira"
        self.cands[1].save()
        tamanhos = set()
        escolhas = [{f"c{self.cargo.pk}": [str(c.pk)]} for c in self.cands] + [{f"b{self.cargo.pk}": "1"}]
        for casa, escolha in zip(("1", "2", "3", "4", "5", "6"), escolhas):
            r = self.client.post("/", {"codigo": self.cods[casa]})
            rv = self.client.post("/votar/revisar", dict(escolha, token=r.context["token"]))
            tamanhos.add(len(rv.content))
        self.assertEqual(len(tamanhos), 1, tamanhos)

    def test_tamanho_fixo_sobe_para_o_proximo_multiplo_se_a_pagina_crescer(self):
        from core.views_voto import TAMANHO_FIXO, _tamanho_fixo
        grande = _tamanho_fixo("x" * (TAMANHO_FIXO + 10))
        self.assertEqual(len(grande.content), 2 * TAMANHO_FIXO)
        self.assertEqual(len(_tamanho_fixo("y").content), TAMANHO_FIXO)


class ParticipacaoTests(TestCase):
    def test_mostra_contagem_sem_candidatos_nem_votos(self):
        eleicao, cargo, cands, cods = criar_eleicao(casas=4)
        votar(self.client, cods["1"], cargo, [cands[0]])
        votar(self.client, cods["2"], cargo, [cands[0]])
        r = self.client.get("/participacao/")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "2")
        self.assertContains(r, "de 4")
        self.assertContains(r, "50,0%")
        for c in cands:
            self.assertNotContains(r, c.nome)
        self.assertNotContains(r, "Casa 1 ")
        self.assertNotContains(r, "Casa 2 ")

    def test_botao_na_tela_de_entrada(self):
        criar_eleicao(casas=1)
        self.assertContains(self.client.get("/"), "Ver quantas casas já votaram")


class JanelaTests(TestCase):
    def test_antes_de_abrir(self):
        _, cargo, cands, cods = criar_eleicao(aberta=False)
        r = self.client.post("/", {"codigo": cods["1"]})
        self.assertContains(r, "A votação ainda não começou")

    def test_depois_de_encerrar(self):
        _, cargo, cands, cods = criar_eleicao(encerrada=True)
        r = self.client.post("/", {"codigo": cods["1"]})
        self.assertContains(r, "A votação foi encerrada")


class AteTresTests(TestCase):
    def test_ate_tres_escolhas(self):
        _, cargo, cands, cods = criar_eleicao(max_escolhas=3)
        r = votar(self.client, cods["1"], cargo, cands[:3])
        self.assertEqual(r.status_code, 302)
        self.assertEqual(Cedula.objects.get().escolhas, ",".join(str(c.pk) for c in sorted(cands[:3], key=lambda c: c.pk)))
