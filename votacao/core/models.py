"""Modelo de dados.

Sigilo do voto: `Eleitor` ("quem votou": casa e horário) e `Cedula` (a urna: só
as escolhas) não têm nenhuma coluna em comum além do cargo/eleição. A cédula
não guarda horário, IP, eleitor nem número em sequência.
"""
import secrets
from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class RowidAleatorioField(models.BigIntegerField):
    """Chave inteira aleatória declarada como `integer primary key`.

    No SQLite, só uma coluna do tipo exato INTEGER vira o próprio rowid. Assim a
    ordem física das cédulas é a ordem dessa chave sorteada, não a ordem de
    chegada. (BigIntegerField viraria "bigint" e manteria um rowid escondido e
    crescente, que revelaria a ordem dos votos.)
    """

    def db_type(self, connection):
        if connection.vendor == "sqlite":
            return "integer"
        return super().db_type(connection)


def id_aleatorio():
    return secrets.randbits(62) + 1


class Eleicao(models.Model):
    DESEMPATE = [
        ("inscricao", "Candidato inscrito primeiro"),
        ("idade", "Candidato mais velho"),
        ("sorteio", "Sorteio na reunião da comissão"),
        ("nova", "Nova votação entre os empatados"),
    ]
    titulo = models.CharField("nome da eleição", max_length=120)
    data = models.DateField("dia")
    abre = models.TimeField("abre às", default="07:00")
    fecha = models.TimeField("encerra às", default="17:00")
    ativa = models.BooleanField("eleição ativa", default=True,
                                help_text="Só uma eleição fica ativa: é a que aparece para os moradores.")
    eh_teste = models.BooleanField("eleição de teste (ensaio)", default=False)
    comissao_ve_votantes = models.BooleanField(
        "a comissão pode ver quais casas já votaram", default=True,
        help_text="Mostra só a casa e o horário. Nunca o voto.")
    regra_desempate = models.CharField("regra de desempate", max_length=12, choices=DESEMPATE, default="idade")
    mensagem_whatsapp = models.TextField(
        "mensagem do WhatsApp",
        default=("Olá, {nome}! Aqui é a Comissão do Residencial Jardins do Lago.\n"
                 "O código de votação da Casa {casa} é: *{codigo}*\n"
                 "A votação é {data}, das {abre} às {fecha}.\n"
                 "Para votar, toque no link:\n{link}\n"
                 "Não passe este código para ninguém."),
        help_text="Use {nome}, {casa}, {codigo}, {data}, {abre}, {fecha} e {link}.")
    codigos_gerados_em = models.DateTimeField(null=True, blank=True, editable=False)
    codigos_gerados_por = models.CharField(max_length=150, blank=True, editable=False)
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "eleição"
        verbose_name_plural = "eleições"
        ordering = ["-data"]

    def __str__(self):
        return f"{self.titulo} ({self.data:%d/%m/%Y})"

    @property
    def abre_em(self):
        return timezone.make_aware(datetime.combine(self.data, self.abre))

    @property
    def fecha_em(self):
        return timezone.make_aware(datetime.combine(self.data, self.fecha))

    def status(self, agora=None):
        agora = agora or timezone.now()
        if agora < self.abre_em:
            return "antes"
        if agora < self.fecha_em:
            return "aberta"
        return "encerrada"

    @property
    def travada(self):
        """Regras e candidatos não mudam depois que a votação abre."""
        return self.pk is not None and timezone.now() >= self.abre_em

    def clean(self):
        if self.abre and self.fecha:
            inicio = datetime.combine(datetime(2000, 1, 1), self.abre)
            fim = datetime.combine(datetime(2000, 1, 1), self.fecha)
            if fim <= inicio:
                raise ValidationError("O encerramento precisa ser depois da abertura.")
            if fim - inicio > timedelta(hours=12):
                raise ValidationError("A votação pode durar no máximo 12 horas.")
        if self.mensagem_whatsapp and "{codigo}" not in self.mensagem_whatsapp:
            raise ValidationError({"mensagem_whatsapp": "A mensagem precisa ter {codigo}."})
        if self.ativa and self._outra_aberta():
            raise ValidationError({"ativa": "Há uma votação aberta agora. Esta eleição não pode ficar ativa até ela encerrar."})

    def _outra_aberta(self):
        outras = Eleicao.objects.filter(ativa=True)
        if self.pk:
            outras = outras.exclude(pk=self.pk)
        return any(e.status() == "aberta" for e in outras)

    def save(self, *args, **kwargs):
        # Ativar outra eleição tiraria do ar a votação em andamento.
        if self.ativa and self._outra_aberta():
            raise ValidationError("Há uma votação aberta agora. Outra eleição não pode ficar ativa até ela encerrar.")
        super().save(*args, **kwargs)
        if self.ativa:
            Eleicao.objects.exclude(pk=self.pk).filter(ativa=True).update(ativa=False)

    @classmethod
    def atual(cls):
        return cls.objects.filter(ativa=True).first()


class Cargo(models.Model):
    eleicao = models.ForeignKey(Eleicao, on_delete=models.CASCADE, related_name="cargos")
    titulo = models.CharField(max_length=120, default="Comissão Eleitoral")
    vagas = models.PositiveSmallIntegerField(default=3)
    max_escolhas = models.PositiveSmallIntegerField(
        "candidatos que cada casa escolhe", default=1,
        help_text="1 candidato por casa, ou até 3.")
    permite_branco = models.BooleanField("permitir voto em branco", default=True)
    ordem = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["ordem", "id"]

    def __str__(self):
        return self.titulo

    def clean(self):
        if not 1 <= (self.max_escolhas or 0) <= 3:
            raise ValidationError({"max_escolhas": "Escolha de 1 a 3 candidatos."})
        if self.vagas and self.max_escolhas and self.max_escolhas > self.vagas:
            raise ValidationError({"max_escolhas": "Não pode passar do número de vagas."})


class Candidato(models.Model):
    cargo = models.ForeignKey(Cargo, on_delete=models.CASCADE, related_name="candidatos")
    numero = models.PositiveSmallIntegerField("número")
    nome = models.CharField(max_length=120)
    casa = models.CharField(max_length=10, blank=True)
    inscrito_em = models.DateField("inscrição", null=True, blank=True)
    nascimento = models.DateField(null=True, blank=True, help_text="Usado no desempate por idade.")

    class Meta:
        ordering = ["numero"]
        constraints = [models.UniqueConstraint(fields=["cargo", "numero"], name="candidato_numero_unico")]

    def __str__(self):
        return f"{self.numero} – {self.nome}"


class Casa(models.Model):
    numero = models.CharField("número", max_length=10, unique=True)
    proprietario = models.CharField(max_length=150)
    telefone = models.CharField("WhatsApp", max_length=20, blank=True,
                                help_text="Só dígitos, com 55 e DDD. Vazio = código em envelope.")
    ativa = models.BooleanField(default=True)

    class Meta:
        ordering = ["numero"]

    def __str__(self):
        return f"Casa {self.numero}"

    @property
    def telefone_mascarado(self):
        t = self.telefone
        if len(t) < 12:
            return "—"
        return f"({t[2:4]}) {t[4]}••••-{t[-4:]}"


class Procuracao(models.Model):
    """Fase 2: o código da casa é reemitido para o procurador."""
    eleicao = models.ForeignKey(Eleicao, on_delete=models.CASCADE)
    casa = models.ForeignKey(Casa, on_delete=models.CASCADE, verbose_name="casa que outorga")
    procurador_nome = models.CharField(max_length=150)
    procurador_telefone = models.CharField(max_length=20)
    procurador_casa = models.CharField(max_length=10, blank=True)
    documento = models.CharField("referência do documento", max_length=200)
    registrada_por = models.CharField(max_length=150, editable=False)
    registrada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "procuração"
        verbose_name_plural = "procurações"
        constraints = [models.UniqueConstraint(fields=["eleicao", "casa"], name="uma_procuracao_por_casa")]


class Eleitor(models.Model):
    """Quem votou: casa e horário. Nenhuma referência à cédula."""
    eleicao = models.ForeignKey(Eleicao, on_delete=models.CASCADE, related_name="eleitores")
    casa = models.ForeignKey(Casa, on_delete=models.CASCADE)
    codigo_hash = models.CharField(max_length=64, unique=True)
    codigo_versao = models.PositiveIntegerField(default=1)
    codigo_emitido_em = models.DateTimeField()
    enviado_para = models.CharField(max_length=12, default="proprietario")
    procuracao = models.ForeignKey(Procuracao, null=True, blank=True, on_delete=models.SET_NULL)
    votou_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["eleicao", "casa"], name="um_codigo_por_casa")]


class Cedula(models.Model):
    """A urna. Só o cargo e as escolhas. Nada de horário, IP ou eleitor."""
    id = RowidAleatorioField(primary_key=True, default=id_aleatorio, editable=False)
    cargo = models.ForeignKey(Cargo, on_delete=models.CASCADE, related_name="cedulas")
    # IDs dos candidatos em ordem crescente, separados por vírgula, ou "BRANCO".
    # Fica na própria linha: uma tabela filha teria rowid sequencial e vazaria a ordem.
    escolhas = models.CharField(max_length=40)

    BRANCO = "BRANCO"


class Auditoria(models.Model):
    """Registro só de acréscimo (um gatilho no banco bloqueia UPDATE e DELETE)."""
    quando = models.DateTimeField(auto_now_add=True)
    usuario = models.CharField(max_length=150)
    acao = models.CharField(max_length=40)
    descricao = models.TextField()
    ip = models.CharField(max_length=45, blank=True)

    class Meta:
        ordering = ["-quando", "-id"]
        verbose_name_plural = "auditoria"


class Tentativa(models.Model):
    """Contador de tentativas que falharam, por janela de tempo."""
    chave = models.CharField(max_length=80)
    janela = models.DateTimeField()
    contagem = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["chave", "janela"], name="tentativa_unica")]
