import getpass

from django.contrib.auth.models import Permission, User
from django.core.management.base import BaseCommand, CommandError

MODELOS = ["eleicao", "cargo", "candidato", "casa", "procuracao", "auditoria"]


class Command(BaseCommand):
    help = "Cria (ou atualiza) a conta de um membro da comissão. Não existe cadastro aberto."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("nome", help="Nome completo, entre aspas")
        parser.add_argument("--senha", help="Se omitida, é perguntada sem aparecer na tela")

    def handle(self, email, nome, senha=None, **opts):
        senha = senha or getpass.getpass("Senha (mínimo 10 caracteres): ")
        if len(senha) < 10:
            raise CommandError("A senha precisa ter pelo menos 10 caracteres.")
        partes = nome.split(" ", 1)
        user, criado = User.objects.get_or_create(username=email.lower(), defaults={"email": email.lower()})
        user.first_name, user.last_name = partes[0], (partes[1] if len(partes) > 1 else "")
        user.is_staff = True
        user.set_password(senha)
        user.save()
        perms = Permission.objects.filter(content_type__app_label="core", content_type__model__in=MODELOS)
        user.user_permissions.set(perms.exclude(codename__in=["add_auditoria", "change_auditoria", "delete_auditoria"]))
        self.stdout.write(self.style.SUCCESS(f"{'Criado' if criado else 'Atualizado'}: {nome} <{email}>"))
