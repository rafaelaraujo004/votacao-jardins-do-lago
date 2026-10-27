from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from core.models import Cedula, Eleicao, Eleitor


class Command(BaseCommand):
    help = "Apaga uma eleição de teste com tudo dela (códigos e cédulas) e compacta o banco (VACUUM)."

    def add_arguments(self, parser):
        parser.add_argument("id", type=int)
        parser.add_argument("--real", action="store_true", help="Necessário para apagar uma eleição que não é de teste")

    def handle(self, id, real, **opts):
        eleicao = Eleicao.objects.filter(pk=id).first()
        if eleicao is None:
            raise CommandError("Eleição não encontrada.")
        if not eleicao.eh_teste and not real:
            raise CommandError("Esta eleição não é de teste. Use --real se tiver certeza.")
        titulo = str(eleicao)
        eleicao.delete()
        with connection.cursor() as c:
            c.execute("VACUUM")
        sobra = Eleitor.objects.filter(eleicao_id=id).count() + Cedula.objects.filter(cargo__eleicao_id=id).count()
        self.stdout.write(self.style.SUCCESS(f"Apagada: {titulo}. Linhas restantes da eleição: {sobra}."))
