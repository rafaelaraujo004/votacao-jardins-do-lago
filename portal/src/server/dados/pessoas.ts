import "server-only";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { ehPapel, ehPermissao, type Papel, type Permissao } from "@/lib/permissoes";

export type Pessoa = {
  uid: string;
  nome: string;
  papel: Papel;
  unitId: string | null;
  status: "ativo" | "suspenso";
  telefone: string;
  permissoesExtras: Permissao[];
  permissoesNegadas: Permissao[];
};

function paraPessoa(uid: string, d: FirebaseFirestore.DocumentData): Pessoa | null {
  if (!ehPapel(d.papel)) return null;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter(ehPermissao) : []);
  return {
    uid,
    nome: String(d.nome ?? ""),
    papel: d.papel,
    unitId: typeof d.unitId === "string" ? d.unitId : null,
    status: d.status === "ativo" ? "ativo" : "suspenso",
    telefone: String(d.telefone ?? ""),
    permissoesExtras: lista(d.permissoesExtras),
    permissoesNegadas: lista(d.permissoesNegadas),
  };
}

const membros = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId).collection("members");

export async function listarPessoas(ctx: Contexto): Promise<Pessoa[]> {
  garantirPermissao(ctx, "moradores.ver");
  const snap = await membros(ctx).get();
  return snap.docs
    .map((d) => paraPessoa(d.id, d.data()))
    .filter((p): p is Pessoa => p !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function obterPessoa(ctx: Contexto, uid: string): Promise<Pessoa | null> {
  garantirPermissao(ctx, "moradores.ver");
  const d = await membros(ctx).doc(uid).get();
  return d.exists ? paraPessoa(d.id, d.data() ?? {}) : null;
}

export async function moradoresDaUnidade(ctx: Contexto, unitId: string): Promise<Pessoa[]> {
  garantirPermissao(ctx, "moradores.ver");
  const snap = await membros(ctx).where("unitId", "==", unitId).get();
  return snap.docs.map((d) => paraPessoa(d.id, d.data())).filter((p): p is Pessoa => p !== null);
}

/** Quantos moradores ativos cada casa tem (para a lista de unidades). */
export async function contarMoradoresPorUnidade(ctx: Contexto): Promise<Map<string, number>> {
  garantirPermissao(ctx, "unidades.ver");
  const snap = await membros(ctx).where("papel", "==", "morador").where("status", "==", "ativo").select("unitId").get();
  const mapa = new Map<string, number>();
  for (const d of snap.docs) {
    const u = d.get("unitId");
    if (typeof u === "string") mapa.set(u, (mapa.get(u) ?? 0) + 1);
  }
  return mapa;
}
