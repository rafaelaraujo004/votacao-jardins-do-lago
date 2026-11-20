"use server";

/**
 * Ações das enquetes. Princípios:
 * - o síndico cria (rascunho), publica e pode encerrar antes do prazo;
 * - o morador vota UMA vez por CASA, e o voto não muda depois;
 * - tudo em transação e com auditoria (o voto é auditado SEM a opção escolhida);
 * - nada é apagado: a enquete só muda de status.
 */
import { revalidatePath } from "next/cache";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { gravarEnquete, mudarStatusEnquete, registrarVoto } from "../dados/enquetes";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { dataHoraLocalParaDate } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { esquemaEnquete, esquemaIdEnquete, esquemaVoto } from "@/lib/validacao-enquetes";
import { avisarNoCelular } from "../push";

function revalidarEnquetes(id?: string) {
  revalidatePath("/admin/enquetes");
  revalidatePath("/enquetes");
  revalidatePath("/inicio");
  if (id) {
    revalidatePath(`/admin/enquetes/${id}`);
    revalidatePath(`/enquetes/${id}`);
  }
}

/** Erro do Firestore "documento já existe" (outra pessoa da casa votou no mesmo instante). */
function jaExiste(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && ((e as { code: unknown }).code === 6 || (e as { code: unknown }).code === "already-exists");
}

/** Cria um rascunho ou altera um rascunho (campo "id" preenchido). */
export async function salvarEnquete(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "enquetes.gerenciar");
    const v = lerFormulario(esquemaEnquete, dados);
    // As datas digitadas valem no fuso do CONDOMÍNIO (vem da sessão, nunca do navegador).
    const abreEm = dataHoraLocalParaDate(v.abreEm, ctx.fuso);
    const fechaEm = dataHoraLocalParaDate(v.fechaEm, ctx.fuso);
    if (!abreEm || !fechaEm) throw new ErroDeNegocio("Confira as datas de abertura e de encerramento.");
    if (fechaEm.getTime() <= Date.now()) throw new ErroDeNegocio("A data de encerramento precisa ser no futuro.");

    const id = await gravarEnquete(adminDb(), ctx, {
      id: v.id,
      pergunta: v.pergunta,
      descricao: v.descricao,
      opcoes: v.opcoes,
      abreEm,
      fechaEm,
      resultado: v.resultado,
    });
    revalidarEnquetes(id);
    return v.id
      ? "Rascunho atualizado. Quando estiver tudo certo, publique a enquete."
      : "Rascunho salvo. Confira e toque em “Publicar” para os moradores verem.";
  });
}

export async function publicarEnquete(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "enquetes.gerenciar");
    const { id } = lerFormulario(esquemaIdEnquete, dados);
    const agora = new Date();
    const e = await mudarStatusEnquete(adminDb(), ctx, id, "publicar", agora);
    revalidarEnquetes(id);
    avisarNoCelular(ctx.condominioId, { papeis: ["morador"] }, { titulo: "Nova enquete: dê sua opinião", texto: e.pergunta, url: `/enquetes/${id}` });
    return e.abreEm.getTime() > agora.getTime()
      ? `Enquete publicada. A votação abre em ${formatarDataHora(e.abreEm, ctx.fuso)}.`
      : "Enquete publicada. Os moradores já podem votar.";
  });
}

export async function encerrarEnquete(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "enquetes.gerenciar");
    const { id } = lerFormulario(esquemaIdEnquete, dados);
    await mudarStatusEnquete(adminDb(), ctx, id, "encerrar");
    revalidarEnquetes(id);
    return "Enquete encerrada. Ninguém mais pode votar.";
  });
}

/** Voto da casa. A casa vem do cadastro de quem vota (ctx.unitId), nunca do formulário. */
export async function votarEnquete(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "enquetes.votar");
    const v = lerFormulario(esquemaVoto, dados);
    try {
      const r = await registrarVoto(adminDb(), ctx, v.id, v.opcaoId);
      revalidarEnquetes(v.id);
      return `Voto registrado: “${r.opcaoTexto}”. Obrigado por participar!`;
    } catch (e) {
      if (jaExiste(e)) throw new ErroDeNegocio("Sua casa já votou nesta enquete. O voto não pode ser mudado.");
      throw e;
    }
  });
}
