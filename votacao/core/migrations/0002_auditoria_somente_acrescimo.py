from django.db import migrations

# A auditoria só aceita novas linhas: o próprio banco recusa alterar ou apagar.
CRIAR = [
    """CREATE TRIGGER auditoria_sem_update BEFORE UPDATE ON core_auditoria
       BEGIN SELECT RAISE(ABORT, 'a auditoria não pode ser alterada'); END;""",
    """CREATE TRIGGER auditoria_sem_delete BEFORE DELETE ON core_auditoria
       BEGIN SELECT RAISE(ABORT, 'a auditoria não pode ser apagada'); END;""",
]
REMOVER = ["DROP TRIGGER IF EXISTS auditoria_sem_update;", "DROP TRIGGER IF EXISTS auditoria_sem_delete;"]


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunSQL(CRIAR, REMOVER)]
