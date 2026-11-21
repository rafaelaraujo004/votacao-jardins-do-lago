/**
 * Consultas da área de gestão.
 *
 * Padrão para TODA função de dados do portal:
 * 1. recebe o Contexto (nunca um condominioId solto vindo de fora);
 * 2. confere a permissão com garantirPermissao;
 * 3. só lê dentro de condominiums/{ctx.condominioId}.
 */
import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { PAPEIS, type Papel } from "@/lib/permissoes";
import { ehUsuarioValido } from "@/lib/usuario-morador";

export type ResumoCondominio = {
  unidades: number;
  pessoasPorPapel: Record<Papel, number>;
  suspensos: number;
  /** Moradores ativos que já têm usuário para entrar no portal (os outros só estão cadastrados). */
  moradoresComAcesso: number;
};

export async function resumoDoCondominio(ctx: Contexto): Promise<ResumoCondominio> {
  garantirPermissao(ctx, "area.gestao");
  const base = adminDb().collection("condominiums").doc(ctx.condominioId);
  const membros = base.collection("members");

  const [unidades, suspensos, moradoresAtivos, ...porPapel] = await Promise.all([
    base.collection("units").count().get(),
    membros.where("status", "!=", "ativo").count().get(),
    // Só o campo "usuario": diz se o morador já recebeu usuário para entrar.
    membros.where("status", "==", "ativo").where("papel", "==", "morador").select("usuario").get(),
    ...PAPEIS.map((p) => membros.where("status", "==", "ativo").where("papel", "==", p).count().get()),
  ]);

  const pessoasPorPapel = Object.fromEntries(
    PAPEIS.map((p, i) => [p, porPapel[i].data().count]),
  ) as Record<Papel, number>;
  const moradoresComAcesso = moradoresAtivos.docs.filter((d) => ehUsuarioValido(d.get("usuario"))).length;

  return { unidades: unidades.data().count, pessoasPorPapel, suspensos: suspensos.data().count, moradoresComAcesso };
}

export type LinhaAuditoria = {
  id: string;
  acao: string;
  nome: string | null;
  papel: string | null;
  alvo: string | null;
  quando: Date | null;
  /**
   * Voto da votação oficial mostrado SEM a casa (para quem não cuida da votação):
   * a tela mostra só "Uma casa votou na votação oficial".
   */
  sigilo: boolean;
};

/** Ação do voto da votação oficial na auditoria. */
const ACAO_VOTO = "eleicao.votar";
const VIA_DO_VOTO: Record<string, string> = { link: "pelo link", portal: "pelo portal" };

/**
 * Lista os últimos registros da auditoria.
 *
 * SIGILO DO VOTO (vale também para os registros antigos, que guardavam o nome e o uid de quem
 * votou): a PESSOA que votou nunca aparece — só "Voto da casa".
 * - Quem cuida da votação (eleicoes.gerenciar) vê a casa e por onde votou (portal ou link):
 *   é a mesma informação que já vê em "quais casas votaram".
 * - Os demais com "ver a auditoria" (ex.: conselheiro com o extra) veem uma linha neutra,
 *   sem casa, sem nome e sem alvo (sigilo: true).
 */
export async function ultimosRegistrosDeAuditoria(
  ctx: Contexto,
  limite = 50,
  db = adminDb(),
): Promise<LinhaAuditoria[]> {
  garantirPermissao(ctx, "auditoria.ver");
  const veCasas = ctx.permissoes.has("eleicoes.gerenciar");
  const base = db.collection("condominiums").doc(ctx.condominioId);
  const consulta = await base
    .collection("auditLogs")
    .orderBy("criadoEm", "desc")
    .limit(Math.min(Math.max(limite, 1), 200))
    .get();

  // Nome das casas que votaram (só para a comissão, e só as que aparecem nesta página).
  const casaDoVoto = (d: (typeof consulta.docs)[number]): string | null => {
    const unidade = (d.get("detalhes") as Record<string, unknown> | undefined)?.unidade;
    return typeof unidade === "string" && unidade ? unidade : null;
  };
  const rotulos = new Map<string, string>();
  if (veCasas) {
    const ids = [
      ...new Set(consulta.docs.filter((d) => d.get("acao") === ACAO_VOTO).map(casaDoVoto).filter((u): u is string => !!u)),
    ];
    if (ids.length) {
      const casas = await db.getAll(...ids.map((u) => base.collection("units").doc(u)), { fieldMask: ["rotulo"] });
      for (const c of casas) {
        const rotulo = c.get("rotulo");
        if (typeof rotulo === "string" && rotulo) rotulos.set(c.id, rotulo);
      }
    }
  }

  // Quem NÃO cuida da votação não vê os votos nesta lista, nem como linha neutra: o horário de
  // cada voto, ao lado de "Fulano entrou no portal", deixaria adivinhar quem votou.
  const docs = veCasas ? consulta.docs : consulta.docs.filter((d) => d.get("acao") !== ACAO_VOTO);
  return docs.map((d) => {
    const acao = String(d.get("acao") ?? "");
    const quando = (d.get("criadoEm") as Timestamp | undefined)?.toDate() ?? null;
    if (acao !== ACAO_VOTO) {
      return {
        id: d.id,
        acao,
        nome: d.get("nome") ?? null,
        papel: d.get("papel") ?? null,
        alvo: d.get("alvo") ?? null,
        quando,
        sigilo: false,
      };
    }
    if (!veCasas) return { id: d.id, acao, nome: null, papel: null, alvo: null, quando, sigilo: true };
    const unidade = casaDoVoto(d);
    const via = VIA_DO_VOTO[String((d.get("detalhes") as Record<string, unknown> | undefined)?.via ?? "")];
    const casa = unidade ? (rotulos.get(unidade) ?? unidade) : null;
    return {
      id: d.id,
      acao,
      nome: "Voto da casa",
      papel: null,
      alvo: [casa, via].filter(Boolean).join(" · ") || null,
      quando,
      sigilo: false,
    };
  });
}
