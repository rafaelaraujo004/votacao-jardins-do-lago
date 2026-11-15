/**
 * Validações (zod) dos formulários de enquetes.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { MAX_OPCOES, REGEX_DATA_HORA, REGRAS_RESULTADO, montarOpcoes } from "./enquetes";

/** Campo que pode vir repetido no formulário (vira lista) ou uma vez só (vira lista de 1). */
const lista = z.preprocess(
  (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.string().max(120, "Cada opção pode ter no máximo 120 caracteres.")).max(MAX_OPCOES + 4),
);

const dataHora = (rotulo: string) =>
  z.string().trim().regex(REGEX_DATA_HORA, `Escolha a data e a hora de ${rotulo}.`);

/**
 * Criar ou editar (só rascunho) uma enquete.
 * As datas continuam como texto "AAAA-MM-DDTHH:MM" no fuso do condomínio;
 * a ação converte usando o fuso da sessão (nunca do navegador).
 */
export const esquemaEnquete = z
  .object({
    id: z.union([z.literal(""), idDocumento]).optional(),
    pergunta: z.string().trim().min(5, "Escreva a pergunta (pelo menos 5 letras).").max(200, "Pergunta muito longa (máximo 200 caracteres)."),
    descricao: z.string().trim().max(1000, "Descrição muito longa (máximo 1.000 caracteres).").default(""),
    opcao: lista,
    abreEm: dataHora("abertura"),
    fechaEm: dataHora("encerramento"),
    resultado: z.enum(REGRAS_RESULTADO, { error: "Diga quando os moradores podem ver o resultado." }),
  })
  .transform((v, contexto) => {
    const opcoes = montarOpcoes(v.opcao);
    if (typeof opcoes === "string") {
      contexto.addIssue({ code: "custom", message: opcoes });
      return z.NEVER;
    }
    // Mesmo fuso nos dois campos: comparar o texto já basta.
    if (v.fechaEm <= v.abreEm) {
      contexto.addIssue({ code: "custom", message: "O encerramento precisa ser depois da abertura." });
      return z.NEVER;
    }
    return {
      id: v.id || null,
      pergunta: v.pergunta,
      descricao: v.descricao,
      opcoes,
      abreEm: v.abreEm,
      fechaEm: v.fechaEm,
      resultado: v.resultado,
    };
  });

export type DadosEnquete = z.output<typeof esquemaEnquete>;

/** Publicar ou encerrar: só o id. */
export const esquemaIdEnquete = z.object({ id: idDocumento });

/** Voto: a CASA vem do cadastro de quem vota, nunca do formulário. */
export const esquemaVoto = z.object({
  id: idDocumento,
  opcaoId: z.string({ error: "Escolha uma opção." }).regex(/^o[1-8]$/, "Escolha uma opção."),
});
