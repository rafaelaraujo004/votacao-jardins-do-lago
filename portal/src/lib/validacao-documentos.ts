/**
 * Validações (zod) dos formulários de documentos.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { CATEGORIAS_DOCUMENTO, linkSeguro, normalizarVisivelPara, PAPEIS_ESCOLHIDOS } from "./documentos";

/** Caixa de marcar que pode vir repetida (vira lista) ou uma vez só (vira lista de 1). */
const lista = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(30)).max(10),
);

const simNao = (mensagem: string) => z.enum(["sim", "nao"], { error: mensagem }).transform((v) => v === "sim");

/** Cadastrar (sem id) ou alterar (com id) um documento. */
export const esquemaDocumento = z
  .object({
    id: z.union([z.literal(""), idDocumento]).optional(),
    titulo: z.string().trim().min(3, "Informe o título (pelo menos 3 letras).").max(120, "Título muito longo (máximo 120 caracteres)."),
    descricao: z.string().trim().max(500, "Descrição muito longa (máximo 500 caracteres).").default(""),
    categoria: z.enum(CATEGORIAS_DOCUMENTO, { error: "Escolha a categoria do documento." }),
    url: z
      .string({ error: "Cole o link do documento." })
      .trim()
      .min(1, "Cole o link do documento.")
      .transform((v, contexto) => {
        const link = linkSeguro(v);
        if (!link) {
          contexto.addIssue({
            code: "custom",
            message: "Link inválido. Use um endereço que comece com https:// (ex.: o link de compartilhamento do Google Drive).",
          });
          return z.NEVER;
        }
        return link;
      }),
    visivelPara: lista,
    ativo: simNao("Diga se o documento fica visível.").default(true),
  })
  .transform((v, contexto) => {
    const escolhidos = v.visivelPara.filter((p) => (PAPEIS_ESCOLHIDOS as readonly string[]).includes(p));
    if (escolhidos.length === 0) {
      contexto.addIssue({ code: "custom", message: "Marque pelo menos um público em \"Quem pode ver\"." });
      return z.NEVER;
    }
    return {
      id: v.id || null,
      titulo: v.titulo,
      descricao: v.descricao,
      categoria: v.categoria,
      url: v.url,
      visivelPara: normalizarVisivelPara(escolhidos),
      ativo: v.ativo,
    };
  });

export type DadosDocumento = z.output<typeof esquemaDocumento>;

/** Ativar ou desativar (o documento nunca é apagado). */
export const esquemaSituacaoDocumento = z.object({
  id: idDocumento,
  ativo: simNao("Situação inválida."),
});
