/**
 * Validações (zod) dos formulários de documentos.
 * Tudo que chega do navegador passa por aqui antes de ser usado.
 */
import { z } from "zod";
import { idDocumento } from "./validacao";
import { CATEGORIAS_DOCUMENTO, linkSeguro, nomeArquivoSeguro, normalizarVisivelPara, PAPEIS_ESCOLHIDOS, tipoArquivoAceito, TAMANHO_MAXIMO_ARQUIVO } from "./documentos";

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
    /** "arquivo" (enviado ao portal) ou "link" (Google Drive etc.). */
    origem: z.enum(["arquivo", "link"], { error: "Escolha se vai enviar um arquivo ou colar um link." }).default("link"),
    url: z.string().trim().max(2100).default(""),
    /** Caminho do arquivo recém-enviado. Vazio ao editar = mantém o arquivo atual. */
    arquivoCaminho: z.string().trim().max(300).default(""),
    arquivoNome: z.string().trim().max(200).default(""),
    visivelPara: lista,
    ativo: simNao("Diga se o documento fica visível.").default(true),
  })
  .transform((v, contexto) => {
    const escolhidos = v.visivelPara.filter((p) => (PAPEIS_ESCOLHIDOS as readonly string[]).includes(p));
    if (escolhidos.length === 0) {
      contexto.addIssue({ code: "custom", message: "Marque pelo menos um público em \"Quem pode ver\"." });
      return z.NEVER;
    }
    let fonte: { origem: "link"; url: string } | { origem: "arquivo"; caminho: string | null; nome: string };
    if (v.origem === "link") {
      const link = linkSeguro(v.url);
      if (!link) {
        contexto.addIssue({
          code: "custom",
          message: v.url
            ? "Link inválido. Use um endereço que comece com https:// (ex.: o link de compartilhamento do Google Drive)."
            : "Cole o link do documento.",
        });
        return z.NEVER;
      }
      fonte = { origem: "link", url: link };
    } else {
      // Documento novo precisa de arquivo; ao editar, sem arquivo novo = mantém o atual.
      if (!v.arquivoCaminho && !v.id) {
        contexto.addIssue({ code: "custom", message: "Escolha o arquivo e espere o envio terminar." });
        return z.NEVER;
      }
      fonte = { origem: "arquivo", caminho: v.arquivoCaminho || null, nome: nomeArquivoSeguro(v.arquivoNome || "documento") };
    }
    return {
      id: v.id || null,
      titulo: v.titulo,
      descricao: v.descricao,
      categoria: v.categoria,
      fonte,
      visivelPara: normalizarVisivelPara(escolhidos),
      ativo: v.ativo,
    };
  });

export type DadosDocumento = z.output<typeof esquemaDocumento>;

/** Pedido de envio de arquivo (o navegador diz nome, tipo e tamanho antes de mandar). */
export const esquemaEnvioArquivo = z.object({
  nome: z.string().trim().min(1, "Arquivo sem nome.").max(200),
  tipo: z.string().refine(tipoArquivoAceito, "Tipo de arquivo não aceito. Envie PDF, foto (JPG/PNG), Word ou Excel."),
  tamanho: z
    .number()
    .int()
    .positive("O arquivo está vazio.")
    .max(TAMANHO_MAXIMO_ARQUIVO, "Arquivo grande demais: o máximo é 20 MB."),
});

/** Ativar ou desativar (o documento nunca é apagado). */
export const esquemaSituacaoDocumento = z.object({
  id: idDocumento,
  ativo: simNao("Situação inválida."),
});
