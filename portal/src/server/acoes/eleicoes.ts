"use server";

/**
 * Ações da votação oficial. Princípios:
 * - a comissão (eleicoes.gerenciar) cria o rascunho, confere e publica;
 *   depois de publicada, regras e candidatos não mudam (só dá para voltar a
 *   rascunho ANTES de abrir);
 * - o morador vota UMA vez por CASA, com voto secreto (nenhuma cédula é guardada);
 * - tudo em transação e com auditoria (o voto é auditado SEM a escolha).
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminDb } from "../firebase-admin";
import { marcarMudancaDepois } from "../sinais";
import { garantirPermissao, getContexto } from "../contexto";
import {
  gravarEleicao,
  mudarStatusEleicao,
  registrarVotoEleicao,
  salvarBloqueios,
  salvarFotoCandidato,
} from "../dados/eleicoes";
import {
  ErroDeNegocio,
  executar,
  lerFormulario,
  type Resultado,
} from "./resultado";
import { dataHoraLocalParaDate } from "@/lib/enquetes";
import { ehVotacaoDeTeste } from "@/lib/eleicoes";
import { redirect } from "next/navigation";
import { excluirVotacao } from "../dados/excluir-votacao";
import { formatarDataHora } from "@/lib/formato";
import { avisarNoCelular } from "../push";
import {
  esquemaBloqueio,
  esquemaCedula,
  esquemaEleicao,
  esquemaFotoCandidato,
  esquemaIdEleicao,
} from "@/lib/validacao-eleicoes";

function revalidar(id?: string) {
  revalidatePath("/admin/votacao");
  revalidatePath("/votacao");
  revalidatePath("/inicio");
  if (id) {
    revalidatePath(`/admin/votacao/${id}`);
    revalidatePath(`/votacao/${id}`);
  }
}

/** Erro do Firestore "documento já existe" (outra pessoa da casa votou no mesmo instante). */
function jaExiste(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "code" in e &&
    ((e as { code: unknown }).code === 6 ||
      (e as { code: unknown }).code === "already-exists")
  );
}

/** Cria um rascunho ou altera um rascunho (campo "id" preenchido). */
export async function salvarEleicao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = lerFormulario(esquemaEleicao, dados);
    // Datas no fuso do CONDOMÍNIO (vem da sessão, nunca do navegador).
    const abreEm = dataHoraLocalParaDate(v.abreEm, ctx.fuso);
    const fechaEm = dataHoraLocalParaDate(v.fechaEm, ctx.fuso);
    if (!abreEm || !fechaEm)
      throw new ErroDeNegocio(
        "Confira as datas de abertura e de encerramento.",
      );
    if (fechaEm.getTime() <= Date.now())
      throw new ErroDeNegocio("O encerramento precisa ser no futuro.");
    const id = await gravarEleicao(adminDb(), ctx, { ...v, abreEm, fechaEm });
    revalidar(id);
    return v.id
      ? "Rascunho atualizado. Quando estiver tudo certo, publique a votação."
      : "Rascunho salvo. Confira os candidatos e toque em “Publicar”.";
  });
}

export async function publicarEleicao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id } = lerFormulario(esquemaIdEleicao, dados);
    const agora = new Date();
    const e = await mudarStatusEleicao(adminDb(), ctx, id, "publicar", agora);
    revalidar(id);
    // Votação de TESTE (título com "TESTE"): o aviso vai só para a comissão, não para os moradores.
    const teste = ehVotacaoDeTeste(e.titulo);
    avisarNoCelular(ctx.condominioId, teste ? { permissao: "eleicoes.gerenciar" } : { papeis: ["morador"] }, {
      titulo: e.abreEm.getTime() > agora.getTime() ? "Votação oficial marcada" : "Votação oficial aberta: vote agora",
      texto: e.abreEm.getTime() > agora.getTime() ? `${e.titulo}: abre ${formatarDataHora(e.abreEm, ctx.fuso)}.` : `${e.titulo}: um voto por casa, secreto.`,
      url: `/votacao/${id}`,
    });
    const aviso = teste ? " É uma votação de TESTE: o aviso no celular foi só para a comissão." : "";
    return e.abreEm.getTime() > agora.getTime()
      ? `Votação publicada. Os moradores podem votar a partir de ${formatarDataHora(e.abreEm, ctx.fuso)}.${aviso}`
      : `Votação publicada e aberta. Os moradores já podem votar.${aviso}`;
  });
}

export async function voltarEleicaoParaRascunho(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id } = lerFormulario(esquemaIdEleicao, dados);
    await mudarStatusEleicao(adminDb(), ctx, id, "rascunho");
    revalidar(id);
    return "A votação voltou para rascunho. Os moradores não a veem até você publicar de novo.";
  });
}

/** Voto da casa. A casa vem do cadastro de quem vota (ctx.unitId), nunca do formulário. */
export async function votarEleicao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.votar");
    const v = lerFormulario(esquemaCedula, dados);
    try {
      await registrarVotoEleicao(adminDb(), ctx, v.id, v.escolha);
      // Avisa as telas da comissão depois de responder (fora da transação do voto).
      after(() => marcarMudancaDepois(adminDb(), ctx.condominioId, "eleicoes"));
      revalidar(v.id);
      // De propósito, a resposta NÃO repete a escolha.
      return "Voto registrado com sucesso. Obrigado por votar!";
    } catch (e) {
      if (jaExiste(e))
        throw new ErroDeNegocio(
          "Sua casa já votou nesta eleição. Cada casa vota uma vez.",
        );
      throw e;
    }
  });
}

/** Casas bloqueadas de votar nesta eleição (a lista marcada substitui a anterior). */
export async function salvarBloqueiosEleicao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = lerFormulario(esquemaBloqueio, dados);
    if (!v.adicionar.length && !v.remover.length)
      throw new ErroDeNegocio("Nada mudou: marque ou desmarque alguma casa.");
    const r = await salvarBloqueios(adminDb(), ctx, v.id, {
      adicionar: v.adicionar,
      remover: v.remover,
    });
    revalidar(v.id);
    return r.bloqueadas === 0
      ? "Nenhuma casa bloqueada: todas as casas ativas podem votar."
      : `${r.bloqueadas} ${r.bloqueadas === 1 ? "casa bloqueada" : "casas bloqueadas"}. ${r.casasAptas} podem votar.`;
  });
}

/** Põe, troca ou tira a foto de um integrante da chapa (a foto vem já reduzida pelo navegador). */
export async function salvarFotoIntegrante(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = lerFormulario(esquemaFotoCandidato, dados);
    const r = await salvarFotoCandidato(adminDb(), ctx, v.id, v.candidato, v.foto);
    revalidar(v.id);
    revalidatePath("/votar/[codigo]", "page");
    return v.foto ? `Foto de ${r.nome} atualizada.` : `Foto de ${r.nome} retirada.`;
  });
}

/**
 * Exclui uma votação de TESTE (ou rascunho sem votos) — definitivo. A regra fica no servidor
 * (src/server/dados/excluir-votacao.ts): a eleição oficial nunca é excluída. Depois volta para a lista.
 */
export async function excluirVotacaoDeTeste(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id } = lerFormulario(esquemaIdEleicao, dados);
    await excluirVotacao(adminDb(), ctx, id);
    revalidar(id);
    redirect("/admin/votacao");
  });
}
