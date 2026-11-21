"use server";

/**
 * Ação da comissão: apagar os dados pessoais da votação depois do resultado (LGPD).
 * Veja src/server/dados/limpeza-votacao.ts (o que apaga e o que fica).
 */
import { revalidatePath } from "next/cache";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { apagarDadosPessoaisDaVotacao } from "../dados/limpeza-votacao";
import { executar, lerFormulario, type Resultado } from "./resultado";
import { esquemaIdEleicao } from "@/lib/validacao-eleicoes";

export async function apagarDadosPessoaisVotacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id } = lerFormulario(esquemaIdEleicao, dados);
    const r = await apagarDadosPessoaisDaVotacao(adminDb(), ctx, id);
    revalidatePath(`/admin/votacao/${id}`);
    revalidatePath(`/admin/votacao/${id}/links`);
    return `Dados da votação apagados: ${r.links} ${r.links === 1 ? "link de voto" : "links de voto"} com as senhas. Os links antigos agora mostram que a votação terminou. O resultado, a ata e as assinaturas continuam guardados.`;
  });
}
