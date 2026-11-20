/**
 * Comprovantes dos lançamentos do caixa (nota, recibo, Pix, boleto pago…).
 *
 * - Cada lançamento guarda uma lista `comprovantes` (no próprio documento do lançamento).
 *   Anexar um comprovante NÃO muda valor nenhum; fica registrado na auditoria.
 * - O arquivo fica no Storage em condominiums/{condominio}/finance/{envio}/{nome} e nunca é
 *   público: quem pode ver o lançamento abre pelo portal (/api/financeiro/comprovantes/...).
 * - Valem as mesmas regras de nome de arquivo dos documentos.
 */
import { z } from "zod";
import { nomeArquivoSeguro } from "@/lib/documentos";

/** Tipos aceitos e o nome que aparece. As regras do Storage repetem esta lista. */
export const TIPOS_COMPROVANTE: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "Foto",
  "image/png": "Imagem",
  "image/webp": "Imagem",
};
export const ACEITA_COMPROVANTE = ".pdf,.jpg,.jpeg,.png,.webp";
/** 20 MB, como os documentos (as regras do Storage repetem). */
export const TAMANHO_MAXIMO_COMPROVANTE = 20 * 1024 * 1024;
/** Mais que isso num lançamento só é engano (e o documento do lançamento não pode crescer sem fim). */
export const MAXIMO_COMPROVANTES = 10;

export function tipoComprovanteAceito(tipo: string): boolean {
  return Object.hasOwn(TIPOS_COMPROVANTE, tipo);
}

/** "PDF · 1,2 MB" */
export function descreverComprovante(c: { tipo: string; tamanho: number }): string {
  const nome = TIPOS_COMPROVANTE[c.tipo] ?? "Arquivo";
  const kb = c.tamanho / 1024;
  const tamanho = kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${nome} · ${tamanho}`;
}

export function pastaComprovantes(condominioId: string): string {
  return `condominiums/${condominioId}/finance/`;
}

/**
 * O caminho enviado pelo navegador é mesmo um comprovante DESTE condomínio?
 * Formato: condominiums/{condominio}/finance/{envio}/{nome}
 */
export function caminhoComprovanteValido(caminho: string, condominioId: string): boolean {
  const pasta = pastaComprovantes(condominioId);
  if (!caminho.startsWith(pasta) || caminho.length > 300) return false;
  const resto = caminho.slice(pasta.length).split("/");
  return resto.length === 2 && /^[A-Za-z0-9-]{8,64}$/.test(resto[0]) && /^[A-Za-z0-9._-]{1,90}$/.test(resto[1]);
}

/** Como fica guardado no lançamento. */
export type ComprovanteGuardado = {
  id: string;
  caminho: string;
  nome: string;
  tipo: string;
  tamanho: number;
};

/** O que a tela recebe (sem o caminho no Storage). */
export type Comprovante = Omit<ComprovanteGuardado, "caminho">;

export const REGEX_ID_COMPROVANTE = /^[A-Za-z0-9-]{8,64}$/;

/** Lê a lista gravada, descartando o que não tiver o formato certo. */
export function lerComprovantes(valor: unknown): ComprovanteGuardado[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const c = v as Record<string, unknown>;
    if (typeof c.id !== "string" || !REGEX_ID_COMPROVANTE.test(c.id)) return [];
    if (typeof c.caminho !== "string" || typeof c.nome !== "string" || typeof c.tipo !== "string") return [];
    const tamanho = Number(c.tamanho);
    if (!Number.isFinite(tamanho) || tamanho <= 0) return [];
    return [{ id: c.id, caminho: c.caminho, nome: c.nome, tipo: c.tipo, tamanho }];
  });
}

/** Para a tela: sem o caminho. */
export function comprovantesParaTela(valor: unknown): Comprovante[] {
  return lerComprovantes(valor).map(({ id, nome, tipo, tamanho }) => ({ id, nome, tipo, tamanho }));
}

const idLancamento = z.string().regex(/^[A-Za-z0-9]{1,64}$/, "Lançamento inválido. Atualize a página.");

export const esquemaEnvioComprovante = z.object({
  nome: z.string().trim().min(1, "Arquivo sem nome.").max(200),
  tipo: z.string().refine(tipoComprovanteAceito, "Tipo de arquivo não aceito. Envie PDF ou foto (JPG, PNG)."),
  tamanho: z
    .number()
    .int()
    .positive("O arquivo está vazio.")
    .max(TAMANHO_MAXIMO_COMPROVANTE, "Arquivo grande demais: o máximo é 20 MB."),
});

export const esquemaAnexarComprovante = z.object({
  lancamentoId: idLancamento,
  caminho: z.string().min(1, "Envie o arquivo antes de salvar.").max(300),
  nome: z.string().trim().min(1).max(200).transform(nomeArquivoSeguro),
});

export const esquemaRemoverComprovante = z.object({
  lancamentoId: idLancamento,
  comprovanteId: z.string().regex(REGEX_ID_COMPROVANTE, "Comprovante inválido. Atualize a página."),
});
