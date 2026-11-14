import "server-only";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";

export type Unidade = {
  id: string;
  rotulo: string;
  numero: number;
  quadra: string | null;
  status: "ativa" | "inativa";
  observacao: string;
};

export function paraUnidade(id: string, d: FirebaseFirestore.DocumentData | undefined): Unidade {
  return {
    id,
    rotulo: String(d?.rotulo ?? id),
    numero: Number(d?.numero ?? 0),
    quadra: typeof d?.quadra === "string" && d.quadra ? d.quadra : null,
    status: d?.status === "inativa" ? "inativa" : "ativa",
    observacao: String(d?.observacao ?? ""),
  };
}

function ordenar(a: Unidade, b: Unidade) {
  return (a.quadra ?? "").localeCompare(b.quadra ?? "", "pt-BR", { numeric: true }) || a.numero - b.numero;
}

/** Todas as casas do condomínio (são poucas centenas; cabe numa leitura). */
export async function listarUnidades(ctx: Contexto): Promise<Unidade[]> {
  garantirPermissao(ctx, "unidades.ver");
  const snap = await adminDb().collection("condominiums").doc(ctx.condominioId).collection("units").get();
  return snap.docs.map((d) => paraUnidade(d.id, d.data())).sort(ordenar);
}

export async function obterUnidade(ctx: Contexto, id: string): Promise<Unidade | null> {
  garantirPermissao(ctx, "unidades.ver");
  const d = await adminDb().collection("condominiums").doc(ctx.condominioId).collection("units").doc(id).get();
  return d.exists ? paraUnidade(d.id, d.data()) : null;
}

/** Mapa id → rótulo, para mostrar "Casa 12" em vez do código. */
export async function rotulosDasUnidades(ctx: Contexto): Promise<Map<string, string>> {
  const snap = await adminDb().collection("condominiums").doc(ctx.condominioId).collection("units").select("rotulo").get();
  return new Map(snap.docs.map((d) => [d.id, String(d.get("rotulo") ?? d.id)]));
}

/** Gera o identificador de uma casa: "casa-012" ou, com quadra, "qb-12". */
export function idDaUnidade(numero: number, quadra?: string | null): string {
  if (quadra) {
    const q = quadra
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `q${q}-${numero}`;
  }
  return `casa-${String(numero).padStart(3, "0")}`;
}
