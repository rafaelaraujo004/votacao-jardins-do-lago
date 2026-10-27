"""Mostra para a comissão, no banco real, as garantias de sigilo da urna."""
from django.core.management.base import BaseCommand
from django.db import connection

from core.models import Cedula


class Command(BaseCommand):
    help = "Confere a estrutura da urna e os ajustes do SQLite que protegem o sigilo."

    def handle(self, **opts):
        tabela = Cedula._meta.db_table
        with connection.cursor() as c:
            c.execute("SELECT sql FROM sqlite_master WHERE name=%s", [tabela])
            ddl = c.fetchone()[0]
            c.execute("PRAGMA journal_mode")
            journal = c.fetchone()[0]
            c.execute("PRAGMA secure_delete")
            secure = c.fetchone()[0]
            c.execute(f'SELECT count(*) FROM "{tabela}" WHERE rowid <> id')
            diferentes = c.fetchone()[0]
        colunas = [f.column for f in Cedula._meta.fields]
        ok = ('"id" integer NOT NULL PRIMARY KEY' in ddl and journal.lower() == "delete" and secure == 1
              and diferentes == 0 and colunas == ["id", "cargo_id", "escolhas"])
        self.stdout.write(f"Colunas da urna: {', '.join(colunas)} (sem horário, IP ou eleitor)")
        self.stdout.write(f"Chave da cédula é o próprio rowid aleatório: {'sim' if diferentes == 0 else 'NÃO'}")
        self.stdout.write(f"Modo do diário do SQLite: {journal} (precisa ser delete, nunca wal)")
        self.stdout.write(f"Apagar de verdade (secure_delete): {'ligado' if secure == 1 else 'DESLIGADO'}")
        self.stdout.write(self.style.SUCCESS("Tudo certo.") if ok else self.style.ERROR("ATENÇÃO: algo fora do esperado."))
