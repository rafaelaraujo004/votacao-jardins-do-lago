import "server-only";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { paraUnidade } from "./unidades";
import { ehPapel, ehPermissao, type Papel, type Permissao } from "@/lib/permissoes";
import { ehUsuarioValido } from "@/lib/usuario-morador";
import { planejarImportacao, type ContatoDaLista, type PlanoImportacao } from "@/lib/importar-moradores";

export type Pessoa = {
  uid: string;
  nome: string;
  papel: Papel;
  unitId: string | null;
  status: "ativo" | "suspenso";
  telefone: string;
  /** Outro telefone (opcional). */
  telefone2: string;
  permissoesExtras: Permissao[];
  permissoesNegadas: Permissao[];
  /** Equipe com senha provisória ainda não trocada. */
  precisaTrocarSenha: boolean;
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
    telefone2: String(d.telefone2 ?? ""),
    permissoesExtras: lista(d.permissoesExtras),
    permissoesNegadas: lista(d.permissoesNegadas),
    precisaTrocarSenha: d.precisaTrocarSenha === true,
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

// ---------- Lista de contatos (lista do Word) → Moradores e equipe ----------

const base = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId);

/** Quantas casas a lista de contatos tem (0 = a lista ainda não foi importada na votação). */
export async function totalDeContatosDaLista(ctx: Contexto): Promise<number> {
  garantirPermissao(ctx, "moradores.gerenciar");
  const r = await base(ctx).collection("contatosVotacao").count().get();
  return r.data().count;
}

/**
 * Plano da importação: quem da lista de contatos ainda não está cadastrado.
 * Lê a lista (contatosVotacao), as casas e as pessoas do condomínio; nada é gravado aqui.
 * A ação de importar recalcula este plano DEPOIS de pegar a trava (src/server/acoes/pessoas.ts).
 */
export async function planoDeImportacao(ctx: Contexto): Promise<PlanoImportacao> {
  garantirPermissao(ctx, "moradores.gerenciar");
  const [contatos, casas, pessoas, controle] = await Promise.all([
    base(ctx).collection("contatosVotacao").select("nome", "telefones").get(),
    base(ctx).collection("units").get(),
    base(ctx).collection("members").select("papel", "unitId", "nome").get(),
    // Moradores que o síndico excluiu (casa → nomes): não voltam sozinhos.
    base(ctx).collection("sistema").doc("importacaoMoradores").get(),
  ]);
  const brutos = controle.get("excluidosPorCasa");
  const excluidosPorCasa: Record<string, string[]> = {};
  if (brutos && typeof brutos === "object") {
    for (const [unitId, nomes] of Object.entries(brutos as Record<string, unknown>)) {
      if (Array.isArray(nomes)) excluidosPorCasa[unitId] = nomes.filter((n): n is string => typeof n === "string");
    }
  }
  const lista: ContatoDaLista[] = contatos.docs.map((d) => ({
    unitId: d.id,
    nome: typeof d.get("nome") === "string" ? (d.get("nome") as string) : "",
    telefones: Array.isArray(d.get("telefones")) ? (d.get("telefones") as unknown[]).filter((t): t is string => typeof t === "string") : [],
  }));
  return planejarImportacao({
    condominioId: ctx.condominioId,
    contatos: lista,
    casas: casas.docs.map((d) => paraUnidade(d.id, d.data())),
    pessoas: pessoas.docs.map((d) => ({
      uid: d.id,
      papel: String(d.get("papel") ?? ""),
      unitId: typeof d.get("unitId") === "string" ? (d.get("unitId") as string) : null,
      nome: String(d.get("nome") ?? ""),
    })),
    excluidosPorCasa,
  });
}

export type MoradoresDaCasa = { cadastrados: number; comAcesso: number };

/**
 * Quantos moradores ativos cada casa tem (para a lista de unidades), separando quem já
 * tem usuário para entrar no portal ("com acesso") de quem só está cadastrado (ex.: veio
 * da lista de contatos e ainda não recebeu usuário e senha).
 */
export async function contarMoradoresPorUnidade(ctx: Contexto): Promise<Map<string, MoradoresDaCasa>> {
  garantirPermissao(ctx, "unidades.ver");
  const snap = await membros(ctx).where("papel", "==", "morador").where("status", "==", "ativo").select("unitId", "usuario").get();
  const mapa = new Map<string, MoradoresDaCasa>();
  for (const d of snap.docs) {
    const u = d.get("unitId");
    if (typeof u !== "string") continue;
    const atual = mapa.get(u) ?? { cadastrados: 0, comAcesso: 0 };
    atual.cadastrados++;
    if (ehUsuarioValido(d.get("usuario"))) atual.comAcesso++;
    mapa.set(u, atual);
  }
  return mapa;
}
