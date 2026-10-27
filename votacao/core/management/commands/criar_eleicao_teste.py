"""Monta uma eleição de ensaio (ou de teste de carga) com códigos conhecidos."""
import json
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core import codigos
from core.models import Candidato, Cargo, Casa, Eleicao, Eleitor

NOMES = ["Marta Siqueira", "João Batista Rezende", "Cláudia Fontes", "Roberto Lacerda", "Silvana Moura",
         "Antônio Valente", "Lúcia Brandão", "Paulo Henriques", "Denise Queiroz", "Edson Teixeira"]


class Command(BaseCommand):
    help = "Cria a eleição de ENSAIO aberta agora, com casas e códigos de teste (gravados num arquivo local)."

    def add_arguments(self, parser):
        parser.add_argument("--casas", type=int, default=220)
        parser.add_argument("--horas", type=float, default=2, help="Quanto tempo a votação fica aberta")
        parser.add_argument("--arquivo", default="loadtest/codigos-teste.json")
        parser.add_argument("--sem-casas", action="store_true", help="Usa as casas já cadastradas")

    def handle(self, casas, horas, arquivo, sem_casas, **opts):
        agora = timezone.localtime()
        fim = min(agora + timedelta(hours=horas), agora.replace(hour=23, minute=59))
        eleicao = Eleicao.objects.create(
            titulo="ENSAIO – Eleição da Comissão Eleitoral", data=agora.date(),
            abre=(agora - timedelta(minutes=1)).time().replace(second=0, microsecond=0),
            fecha=fim.time().replace(second=0, microsecond=0), ativa=True, eh_teste=True)
        cargo = Cargo.objects.create(eleicao=eleicao, titulo="Comissão Eleitoral", vagas=3, max_escolhas=1)
        for i, nome in enumerate(NOMES):
            Candidato.objects.create(cargo=cargo, numero=11 + i, nome=nome)
        if not sem_casas:
            for n in range(1, casas + 1):
                Casa.objects.update_or_create(numero=str(n), defaults={
                    "proprietario": f"Morador de teste {n}", "telefone": "", "ativa": True})
        saida = []
        for casa in Casa.objects.filter(ativa=True):
            c = codigos.gerar()
            Eleitor.objects.create(eleicao=eleicao, casa=casa, codigo_hash=codigos.hash_codigo(c),
                                   codigo_emitido_em=timezone.now())
            saida.append({"casa": casa.numero, "codigo": c})
        candidatos = list(cargo.candidatos.values_list("pk", flat=True))
        with open(arquivo, "w", encoding="utf-8") as f:
            json.dump({"cargo": cargo.pk, "candidatos": candidatos, "codigos": saida}, f)
        self.stdout.write(self.style.SUCCESS(
            f"Ensaio criado (id {eleicao.pk}), aberto até {eleicao.fecha:%H:%M}. {len(saida)} códigos em {arquivo}. "
            f"Depois: python manage.py apagar_eleicao {eleicao.pk}"))
