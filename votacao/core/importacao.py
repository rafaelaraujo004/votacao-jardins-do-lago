"""Leitura do CSV das casas, como sai do Excel no Brasil.

Aceita separador ";" ou ",", UTF-8 (com ou sem BOM) ou Windows-1252, e telefones
em qualquer formato. Colunas: casa, proprietário, telefone (nessa ordem, com ou
sem linha de cabeçalho).
"""
import csv
import io
import re

CABECALHO = {"casa", "numero", "número", "proprietario", "proprietário", "nome", "telefone", "contato", "whatsapp"}


def decodificar(conteudo: bytes) -> str:
    for cod in ("utf-8-sig", "cp1252"):
        try:
            return conteudo.decode(cod)
        except UnicodeDecodeError:
            continue
    return conteudo.decode("latin-1")


def normalizar_telefone(texto):
    """Devolve (telefone, erro). Telefone só com dígitos, começando por 55."""
    d = re.sub(r"\D", "", texto or "")
    if not d:
        return "", None
    if d.startswith("55") and len(d) in (12, 13):
        return d, None
    if d.startswith("0"):
        d = d.lstrip("0")
    if len(d) in (10, 11):
        return "55" + d, None
    if len(d) in (8, 9):
        return "", f"telefone sem DDD ({texto.strip()})"
    return "", f"telefone inválido ({texto.strip()})"


def ler(texto):
    """Devolve (casas, erros, avisos). casas = [{numero, proprietario, telefone}]."""
    amostra = texto[:2000]
    sep = ";" if amostra.count(";") >= amostra.count(",") else ","
    linhas = list(csv.reader(io.StringIO(texto), delimiter=sep))
    casas, erros, avisos, vistos = [], [], [], {}
    for i, linha in enumerate(linhas, start=1):
        campos = [c.strip() for c in linha]
        if not any(campos):
            continue
        if i == 1 and campos and campos[0].lower() in CABECALHO:
            continue
        if len(campos) < 2:
            erros.append(f"Linha {i}: faltam colunas (precisa de casa e proprietário).")
            continue
        numero = campos[0].upper().lstrip("0") or "0"
        nome = campos[1]
        tel_txt = campos[2] if len(campos) > 2 else ""
        if not re.fullmatch(r"\d{1,4}[A-Z]?", numero):
            erros.append(f"Linha {i}: número de casa inválido ({campos[0]}).")
            continue
        if not nome:
            erros.append(f"Linha {i}: casa {numero} sem nome do proprietário.")
            continue
        if numero in vistos:
            erros.append(f"Linha {i}: a casa {numero} já apareceu na linha {vistos[numero]}.")
            continue
        telefone, erro_tel = normalizar_telefone(tel_txt)
        if erro_tel:
            erros.append(f"Linha {i}: casa {numero}, {erro_tel}.")
            continue
        if not telefone:
            avisos.append(f"Linha {i}: casa {numero} sem telefone. O código vai em envelope.")
        vistos[numero] = i
        casas.append({"numero": numero, "proprietario": nome, "telefone": telefone})
    return casas, erros, avisos
