/**
 * TESTE DE CARGA PELAS AÇÕES DA PÁGINA (contra o simulador: npm run test:emu).
 *
 * Passa pelas mesmas Server Actions que o celular do morador chama (entrarComSenha e
 * votarComCodigo), com o endereço de internet lido do cabeçalho e o cookie de verdade.
 * 60 casas atrás do MESMO endereço (mais que as 30 tentativas que o limite antigo
 * deixava a cada 10 minutos, contando até os votos certos) digitam a senha e votam juntas.
 * Todas têm que conseguir.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

// Ambiente das ações: o mesmo projeto do simulador, um endereço só para todos e cookies por link.
const ambiente = vi.hoisted(() => {
  process.env.FIREBASE_PROJECT_ID = "demo-jardins-carga-acoes";
  return { ip: "201.17.40.10", cookies: new Map<string, string>() };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${ambiente.ip}, 10.0.0.1` }),
  cookies: async () => ({
    get: (nome: string) => (ambiente.cookies.has(nome) ? { name: nome, value: ambiente.cookies.get(nome) } : undefined),
    set: (nome: string, valor: string) => {
      ambiente.cookies.set(nome, valor);
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
const marcasDepois = vi.hoisted(() => ({ total: 0 }));
vi.mock("next/server", () => ({
  // Na Vercel, after() roda depois da resposta; aqui roda logo em seguida.
  after: (tarefa: () => unknown) => {
    marcasDepois.total++;
    void Promise.resolve()
      .then(tarefa)
      .catch(() => undefined);
  },
}));

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarEleicao, mudarStatusEleicao } from "@/server/dados/eleicoes";
import { gerarLinksFaltantes } from "@/server/dados/votacao-links";
import { entrarComSenha, votarComCodigo } from "@/server/acoes/votacao-links";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-carga-acoes";
const CASAS = 60;
const HORA = 3_600_000;
let db: Firestore;

beforeAll(() => {
  // As ações usam o app padrão (adminDb); o teste lê pelo mesmo projeto.
  const app = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ projectId: PROJETO });
  db = getFirestore(app);
});

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

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("carga pelas ações: 60 casas atrás do mesmo endereço", () => {
  it("todas digitam a senha e votam; ninguém vê 'muitas tentativas'", { timeout: 120_000 }, async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
    await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });

    await db.doc("condominiums/carga").set({ nome: "Carga", status: "ativo", fuso: "America/Belem" });
    const lote = db.batch();
    for (let n = 1; n <= CASAS; n++) {
      lote.set(db.doc(`condominiums/carga/units/casa-${String(n).padStart(3, "0")}`), { rotulo: `Casa ${n}`, numero: n, status: "ativa" });
    }
    await lote.commit();
    const id = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Eleição pelas ações",
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
    expect(links).toHaveLength(CASAS);

    const resultados = await Promise.all(
      links.map(async (l) => {
        const senha = await entrarComSenha(null, formulario({ codigo: l.codigo, senha: l.senha }));
        if (!senha?.ok) return `senha: ${senha?.ok === false ? senha.erro : "sem resposta"}`;
        const voto = await votarComCodigo(null, formulario({ codigo: l.codigo, escolha: "sim" }));
        return voto?.ok ? "ok" : `voto: ${voto?.ok === false ? voto.erro : "sem resposta"}`;
      }),
    );

    expect(resultados.filter((r) => r !== "ok")).toEqual([]);
    expect((await db.collection(`condominiums/carga/elections/${id}/votantes`).count().get()).data().count).toBe(CASAS);
    expect((await db.collection("rateLimits").get()).size).toBe(0);
    // Cada voto pediu o aviso para as telas da comissão (depois de responder).
    expect(marcasDepois.total).toBe(CASAS);
  });
});
