"""Teste de carga: todas as casas do ensaio votam ao mesmo tempo, pelas 3 telas.

Uso (com a eleição de ensaio criada por `criar_eleicao_teste`):
    python loadtest/carga.py http://localhost:8000 --paralelo 40
Depois confira no painel: cédulas = votantes. Rode só contra o ensaio, nunca na eleição real.
"""
import argparse
import http.cookiejar
import json
import re
import statistics
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor


def votar(base, codigo, cargo, candidatos, i):
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    tempos = []

    def post(caminho, dados, csrf):
        corpo = urllib.parse.urlencode(dict(dados, csrfmiddlewaretoken=csrf), doseq=True).encode()
        req = urllib.request.Request(base + caminho, corpo, headers={"Origin": base, "Referer": base + "/"})
        t = time.perf_counter()
        with op.open(req, timeout=30) as r:
            html = r.read().decode()
            tempos.append(time.perf_counter() - t)
            return r.geturl(), html

    t = time.perf_counter()
    html = op.open(base + "/", timeout=30).read().decode()
    tempos.append(time.perf_counter() - t)
    csrf = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html).group(1)
    _, html = post("/", {"codigo": codigo}, csrf)
    token = re.search(r'name="token" value="([^"]+)"', html).group(1)
    escolha = {"token": token, f"c{cargo}": [str(candidatos[i % len(candidatos)])]}
    post("/votar/revisar", escolha, csrf)
    url, _ = post("/votar/confirmar", dict(escolha, acao="confirmar"), csrf)
    return url.endswith("/votar/obrigado"), tempos


def main():
    p = argparse.ArgumentParser()
    p.add_argument("base")
    p.add_argument("--arquivo", default="loadtest/codigos-teste.json")
    p.add_argument("--paralelo", type=int, default=40)
    a = p.parse_args()
    dados = json.load(open(a.arquivo, encoding="utf-8"))
    base = a.base.rstrip("/")
    inicio = time.perf_counter()
    ok, erros, tempos, trava = 0, [], [], threading.Lock()

    def tarefa(par):
        i, item = par
        try:
            sucesso, t = votar(base, item["codigo"], dados["cargo"], dados["candidatos"], i)
            with trava:
                tempos.extend(t)
                return sucesso
        except Exception as e:  # noqa: BLE001 - relatório do teste
            erros.append(f"casa {item['casa']}: {e}")
            return False

    with ThreadPoolExecutor(a.paralelo) as ex:
        ok = sum(ex.map(tarefa, enumerate(dados["codigos"])))
    total = time.perf_counter() - inicio
    tempos.sort()
    p95 = tempos[int(len(tempos) * .95) - 1] if tempos else 0
    print(f"Votos confirmados: {ok} de {len(dados['codigos'])} em {total:.1f}s com {a.paralelo} em paralelo")
    print(f"Requisições: {len(tempos)} · mediana {statistics.median(tempos)*1000:.0f} ms · p95 {p95*1000:.0f} ms")
    if erros:
        print(f"{len(erros)} erros, por exemplo: {erros[:3]}")


if __name__ == "__main__":
    main()
