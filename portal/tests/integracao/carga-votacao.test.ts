/**
 * TESTE DE CARGA DA VOTAÇÃO (contra o simulador: npm run test:emu).
 *
 * O dia da eleição: as 225 casas abrem o link, digitam a senha e votam praticamente
 * ao MESMO TEMPO, todas atrás do MESMO endereço de internet (pior caso: operadora de
 * celular que divide um endereço entre muitos aparelhos, ou o Wi-Fi do condomínio).
 * Usa o caminho real do link de voto (votacaoPorCodigo → conferirSenha → votarPorCodigo).
 *
 * Confere: ninguém é barrado por "muitas tentativas", nenhum voto se perde ou se repete,
 * dois aparelhos da mesma casa votando juntos contam um voto só, a urna (repartida)
 * soma certo e a apuração bate com os votos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarEleicao, lerApuracao, mudarStatusEleicao, paraEleicao } from "@/server/dados/eleicoes";
import { conferirSenha, gerarLinksFaltantes, hashSenha, votacaoPorCodigo, votarPorCodigo } from "@/server/dados/votacao-links";
import { calcularPermissoes } from "@/lib/permissoes";
import { somarUrna, type ApuracaoChapa, type Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-carga";
const CASAS = 225;
/** Casas em que dois aparelhos votam no mesmo instante (só um voto pode valer). */
const CASAS_COM_DOIS_APARELHOS = 25;
/** O mesmo endereço de internet para todo mundo (pior caso). */
const IP = "201.17.40.10";
const HORA = 3_600_000;

let db: Firestore;

beforeAll(() => {
  const app = getApps().find((a) => a.name === PROJETO) ?? initializeApp({ projectId: PROJETO }, PROJETO);
  db = getFirestore(app);
});

async function limpar() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
}

const comissao: Contexto = {
  uid: "sindico",
  nome: "Comissão",
  condominioId: "carga",
  condominioNome: "Carga",
  fuso: "America/Belem",
  papel: "admin",
  unitId: null,
  unidadeRotulo: null,
  permissoes: calcularPermissoes("admin"),
  demo: false,
  precisaTrocarSenha: false,
};

const cand = (n: number): Candidato => ({ id: `c${n}`, numero: n, nome: `Integrante ${n}`, funcao: "Fiscal", casa: "", apresentacao: "", nascimento: null });

describe("carga: 225 casas votando ao mesmo tempo, atrás do mesmo endereço", () => {
  it("todas votam, nada se perde nem se repete, e a apuração bate", { timeout: 180_000 }, async () => {
    await limpar();
    // Condomínio com 225 casas ativas.
    await db.doc("condominiums/carga").set({ nome: "Carga", status: "ativo", fuso: "America/Belem" });
    for (let i = 0; i < CASAS; i += 200) {
      const lote = db.batch();
      for (let n = i + 1; n <= Math.min(CASAS, i + 200); n++) {
        const id = `casa-${String(n).padStart(3, "0")}`;
        lote.set(db.doc(`condominiums/carga/units/${id}`), { rotulo: `Casa ${n}`, numero: n, status: "ativa" });
      }
      await lote.commit();
    }

    // Chapa única aberta agora, links gerados para todas as casas.
    const id = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Eleição de carga",
      cargo: "Chapa única",
      modo: "chapa",
      vagas: 5,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: new Date(Date.now() - HORA),
      fechaEm: new Date(Date.now() + 8 * HORA),
      candidatos: [cand(1), cand(2), cand(3), cand(4), cand(5)],
    });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    const gerados = await gerarLinksFaltantes(db, comissao, id);
    expect(gerados.gerados).toBe(CASAS);
    const links = (await db.collection(`condominiums/carga/elections/${id}/links`).get()).docs.map((d) => ({
      unitId: d.id,
      codigo: d.get("codigo") as string,
      senha: d.get("senha") as string,
    }));
    expect(links).toHaveLength(CASAS);

    // Cada casa: abre o link, digita a senha certa e vota (Sim nas pares, Não nas ímpares).
    const escolhaDa = (unitId: string) => (Number(unitId.slice(-3)) % 2 === 0 ? "sim" : "nao");
    const fluxo = async (l: (typeof links)[number], aparelho: number) => {
      const pagina = await votacaoPorCodigo(l.codigo);
      if (!pagina || pagina.situacao !== "aberta") throw new Error(`página do link não abriu (${l.unitId})`);
      const senha = await conferirSenha(l.codigo, l.senha, IP);
      if (!senha.ok) throw new Error(`senha recusada (${l.unitId}, aparelho ${aparelho}): ${senha.erro}`);
      return votarPorCodigo(l.codigo, senha.token, [escolhaDa(l.unitId)], db, IP);
    };

    const inicio = Date.now();
    const tarefas = [
      ...links.map((l) => ({ l, aparelho: 1 })),
      ...links.slice(0, CASAS_COM_DOIS_APARELHOS).map((l) => ({ l, aparelho: 2 })),
    ];
    const resultados = await Promise.allSettled(tarefas.map((t) => fluxo(t.l, t.aparelho)));
    const duracaoMs = Date.now() - inicio;

    const falhas = resultados
      .map((r, i) => ({ r, t: tarefas[i] }))
      .filter((x) => x.r.status === "rejected")
      .map((x) => ({ casa: x.t.l.unitId, aparelho: x.t.aparelho, erro: String((x.r as PromiseRejectedResult).reason?.message ?? x.r) }));

    // Só podem falhar os SEGUNDOS aparelhos (a casa já votou), e nunca por "muitas tentativas".
    const falhasInesperadas = falhas.filter((f) => !/já votou|já foi realizado|already exists|ALREADY_EXISTS/i.test(f.erro));
    expect(falhasInesperadas, JSON.stringify(falhasInesperadas.slice(0, 5))).toEqual([]);
    expect(falhas.length).toBe(CASAS_COM_DOIS_APARELHOS);

    // Cada casa votou exatamente uma vez.
    const votantes = await db.collection(`condominiums/carga/elections/${id}/votantes`).count().get();
    expect(votantes.data().count).toBe(CASAS);

    // A urna repartida soma exatamente os votos (nenhum perdido, nenhum repetido).
    const urna = somarUrna((await db.collection(`condominiums/carga/elections/${id}/urna`).get()).docs.map((d) => d.data()));
    const simEsperado = links.filter((l) => escolhaDa(l.unitId) === "sim").length;
    expect(urna.cedulas).toBe(CASAS);
    expect(urna.sim + urna.nao).toBe(CASAS);
    expect(urna.sim).toBe(simEsperado);

    // Acertar a senha e votar não gastaram tentativas do endereço compartilhado.
    const limites = await db.collection("rateLimits").get();
    expect(limites.size).toBe(0);

    // Depois do encerramento, a apuração bate com a urna.
    const e = paraEleicao(id, (await db.doc(`condominiums/carga/elections/${id}`).get()).data());
    const apuracao = (await lerApuracao(comissao, e, new Date(e.fechaEm.getTime() + 3 * 60_000), db)) as ApuracaoChapa;
    expect(apuracao.sim).toBe(simEsperado);
    expect(apuracao.nao).toBe(CASAS - simEsperado);

    console.log(
      `[carga] ${tarefas.length} fluxos (abrir link + senha + voto) em ${(duracaoMs / 1000).toFixed(1)} s · ` +
        `${CASAS} votos contados · ${falhas.length} segundos aparelhos barrados (casa já votou)`,
    );
  });

  it("quem erra a senha não atrapalha os vizinhos atrás do mesmo endereço", { timeout: 60_000 }, async () => {
    await limpar();
    await db.doc("condominiums/carga").set({ nome: "Carga", status: "ativo", fuso: "America/Belem" });
    const lote = db.batch();
    for (let n = 1; n <= 40; n++) {
      lote.set(db.doc(`condominiums/carga/units/casa-${String(n).padStart(3, "0")}`), { rotulo: `Casa ${n}`, numero: n, status: "ativa" });
    }
    await lote.commit();
    const id = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Eleição de carga 2",
      cargo: "Chapa única",
      modo: "chapa",
      vagas: 5,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: new Date(Date.now() - HORA),
      fechaEm: new Date(Date.now() + 8 * HORA),
      candidatos: [cand(1)],
    });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    await gerarLinksFaltantes(db, comissao, id);
    const links = (await db.collection(`condominiums/carga/elections/${id}/links`).get()).docs.map((d) => ({
      codigo: d.get("codigo") as string,
      senha: d.get("senha") as string,
    }));

    // 10 casas erram a senha 2 vezes cada (20 erros do mesmo endereço)...
    for (const l of links.slice(0, 10)) {
      const errada = l.senha === "000000" ? "111111" : "000000";
      expect((await conferirSenha(l.codigo, errada, IP)).ok).toBe(false);
      expect((await conferirSenha(l.codigo, errada, IP)).ok).toBe(false);
    }
    // ...e TODAS as 40 casas (inclusive as que erraram) ainda entram e votam do mesmo endereço.
    const r = await Promise.all(
      links.map(async (l) => {
        const s = await conferirSenha(l.codigo, l.senha, IP);
        if (!s.ok) return s.erro;
        await votarPorCodigo(l.codigo, s.token, ["sim"], db, IP);
        return "ok";
      }),
    );
    expect(r.filter((x) => x !== "ok")).toEqual([]);
    expect((await db.collection(`condominiums/carga/elections/${id}/votantes`).count().get()).data().count).toBe(40);
    // Confere que o hash do cookie é o mesmo que o servidor espera (sanidade do teste).
    expect(hashSenha(links[0].codigo, links[0].senha)).toMatch(/^[0-9a-f]{64}$/);
  });
});
