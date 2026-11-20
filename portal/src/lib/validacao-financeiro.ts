/**
 * Validação dos formulários do financeiro que não são lançamentos:
 * quadro de casas do mês e categorias.
 */
import { z } from "zod";
import { CAMPOS_QUADRO, LIMITE_OBSERVACAO_QUADRO, LIMITE_QUADRO, REGEX_MES, type QuadroCasas } from "./financeiro";
import { idDocumento } from "./validacao";

/** Campo numérico opcional do quadro: vazio = não informado. Aceita "1.200" (ponto de milhar). */
const quantidade = z
  .string()
  .trim()
  .transform((v) => v.replace(/\./g, ""))
  .refine((v) => v === "" || /^\d{1,6}$/.test(v), "Use só números inteiros (ex.: 120).")
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || v <= LIMITE_QUADRO, "Número alto demais. Confira.");

export const esquemaQuadroCasas = z
  .object({
    mes: z.string().regex(REGEX_MES, "Mês inválido."),
    total: quantidade,
    pagas: quantidade,
    pagasSemExtra: quantidade,
    acordos: quantidade,
    isentas: quantidade,
    inadimplentes: quantidade,
    boletosVencidos: quantidade,
    observacao: z.string().trim().max(LIMITE_OBSERVACAO_QUADRO, "Observação muito longa."),
  })
  .superRefine((v, ctx) => {
    if (v.total === null) return;
    for (const c of CAMPOS_QUADRO) {
      const n = v[c.chave];
      if (c.chave !== "total" && n !== null && n > v.total) {
        ctx.addIssue({ code: "custom", path: [c.chave], message: `"${c.rotulo}" não pode passar do total de casas (${v.total}).` });
      }
    }
  });

/** Só os números e a observação (o que vai para o banco). */
export function quadroDoFormulario(v: z.infer<typeof esquemaQuadroCasas>): QuadroCasas {
  return {
    total: v.total,
    pagas: v.pagas,
    pagasSemExtra: v.pagasSemExtra,
    acordos: v.acordos,
    isentas: v.isentas,
    inadimplentes: v.inadimplentes,
    boletosVencidos: v.boletosVencidos,
    observacao: v.observacao,
  };
}

export const esquemaNovaCategoria = z.object({
  nome: z.string().trim().min(3, "Dê um nome com pelo menos 3 letras.").max(40, "Nome muito longo (até 40 letras)."),
  tipo: z.enum(["receita", "despesa"], { error: "Escolha se é de entrada ou de saída." }),
});

export const esquemaAlternarCategoria = z.object({
  id: idDocumento.refine(Boolean, "Categoria inválida."),
  ativa: z.enum(["sim", "nao"]),
});

/** "Fundo de reserva / obras" → "fundo-de-reserva-obras" (id do documento da categoria). */
export function idDaCategoria(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
