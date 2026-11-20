"use server";

/**
 * Ações do síndico na tela "Informações do condomínio".
 * Cada formulário grava SÓ os seus campos (informacoes.<campo>), assim um
 * formulário nunca apaga o que o outro salvou. Toda gravação é auditada
 * (só os NOMES dos campos que mudaram, nunca os valores).
 */
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import {
  esquemaInformacoes,
  esquemaLinkVotacao,
  esquemaPix,
  esquemaPlantao,
} from "@/lib/validacao-informacoes";

type Valor = string | null | Record<string, string | null>;

/** Compara dois valores simples (texto ou objeto pequeno) sem depender da ordem das chaves. */
function igual(a: unknown, b: unknown): boolean {
  const estavel = (v: unknown) =>
    v && typeof v === "object" ? JSON.stringify(v, Object.keys(v as object).sort()) : JSON.stringify(v ?? null);
  return estavel(a) === estavel(b);
}

/**
 * Grava os campos em condominiums/{c}.informacoes numa transação, junto com a auditoria.
 * O condomínio sai do contexto (do login), nunca do formulário.
 */
async function gravar(ctx: Contexto, novos: Record<string, Valor>, extras: Record<string, string> = {}): Promise<void> {
  const db = adminDb();
  const ref = db.collection("condominiums").doc(ctx.condominioId);

  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    if (!atual.exists) throw new ErroDeNegocio("Cadastro do residencial não encontrado.");
    const antes = (atual.get("informacoes") ?? {}) as Record<string, unknown>;
    // Quais campos mudaram (só os nomes, para a auditoria ficar curta e sem dados).
    const mudaram = Object.keys(novos).filter((k) => !igual(antes[k], novos[k]));

    const atualizacao: Record<string, unknown> = { "informacoes.atualizadoEm": FieldValue.serverTimestamp() };
    for (const [campo, valor] of Object.entries(novos)) atualizacao[`informacoes.${campo}`] = valor;
    tx.update(ref, atualizacao);

    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: "informacoes.alterar",
      alvo: `condominiums/${ctx.condominioId}`,
      detalhes: { camposAlterados: mudaram.join(", ") || "nenhum", ...extras },
    });
  });

  revalidatePath("/admin/informacoes");
  revalidatePath("/", "layout"); // a área do morador mostra o aviso, os contatos e o PIX
}

/** Salva telefones, horário e aviso (o morador vê depois de entrar). */
export async function salvarInformacoes(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "informacoes.gerenciar");
    const v = lerFormulario(esquemaInformacoes, dados);
    await gravar(ctx, {
      telefonePortaria: v.telefonePortaria,
      telefoneAdministracao: v.telefoneAdministracao,
      whatsappAdministracao: v.whatsappAdministracao,
      horarioAdministracao: v.horarioAdministracao,
      aviso: v.aviso,
    });
    return "Informações salvas.";
  });
}

/**
 * Salva o PIX da taxa condominial.
 * Proteção contra golpe: SÓ o síndico (papel admin) troca a chave, mesmo que
 * outra pessoa tenha recebido a permissão "informacoes.gerenciar".
 */
export async function salvarPix(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "informacoes.gerenciar");
    if (ctx.papel !== "admin") {
      throw new ErroDeNegocio("Só o síndico pode alterar a chave PIX. Isso protege os moradores contra golpes.");
    }
    const { pix } = lerFormulario(esquemaPix, dados);
    // Na auditoria vai só o TIPO da chave (nunca a chave em si).
    await gravar(ctx, { pix }, { pixTipo: pix?.tipo ?? "removido" });
    return pix ? "PIX salvo. Os moradores já veem a nova chave." : "PIX removido do portal.";
  });
}

/** Salva o telefone da ronda noturna e o responsável pelas reservas. */
export async function salvarPlantao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "informacoes.gerenciar");
    const v = lerFormulario(esquemaPlantao, dados);
    await gravar(ctx, { telefoneRonda: v.telefoneRonda, responsavelReservas: v.responsavelReservas });
    return "Ronda e responsável pelas reservas salvos.";
  });
}

/** Salva (ou tira) o link da votação oficial. */
export async function salvarLinkVotacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "informacoes.gerenciar");
    const { linkVotacao } = lerFormulario(esquemaLinkVotacao, dados);
    await gravar(ctx, { linkVotacao });
    return linkVotacao ? "Link da votação salvo." : "Link da votação removido.";
  });
}
