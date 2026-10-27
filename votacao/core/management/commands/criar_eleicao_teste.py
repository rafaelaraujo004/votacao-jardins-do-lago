"""Monta uma eleição de ensaio (ou de teste de carga) com códigos conhecidos."""
import json
from datetime import time, timedelta

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
        if fim - agora < timedelta(hours=1):
            # Perto da meia-noite: o ensaio vale o dia seguinte inteiro (só para teste).
            data, abre, fecha = (agora + timedelta(days=1)).date(), time(0, 0), time(23, 59)
        else:
            data = agora.date()
            abre = (agora - timedelta(minutes=1)).time().replace(second=0, microsecond=0)
            fecha = fim.time().replace(second=0, microsecond=0)
        eleicao = Eleicao.objects.create(titulo="ENSAIO – Eleição da Comissão Eleitoral", data=data,
                                         abre=abre, fecha=fecha, ativa=True, eh_teste=True)
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
            f"Ensaio criado (id {eleicao.pk}): {eleicao.data:%d/%m}, das {eleicao.abre:%H:%M} às {eleicao.fecha:%H:%M}. {len(saida)} códigos em {arquivo}. "
            f"Depois: python manage.py apagar_eleicao {eleicao.pk}"))
