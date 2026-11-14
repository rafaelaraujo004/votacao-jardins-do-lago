import "server-only";
import { z } from "zod";
import { ErroDeAcesso } from "../contexto";

/**
 * Resposta padrão de toda ação de formulário.
 * O formulário mostra `mensagem` como aviso de sucesso, ou `erro` explicando como resolver.
 */
export type Resultado = { ok: true; mensagem: string; vez: number } | { ok: false; erro: string; vez: number } | null;

/** Erro de regra do negócio, com mensagem já pronta para a pessoa ler. */
export class ErroDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
  }
}

/** Lê um FormData com um esquema zod; erros viram mensagem humana. */
export function lerFormulario<T extends z.ZodType>(esquema: T, dados: FormData): z.infer<T> {
  const objeto: Record<string, unknown> = {};
  for (const [chave, valor] of dados.entries()) {
    if (chave.startsWith("$")) continue; // campos internos do Next
    if (chave in objeto) {
      const atual = objeto[chave];
      objeto[chave] = Array.isArray(atual) ? [...atual, valor] : [atual, valor];
    } else {
      objeto[chave] = valor;
    }
  }
  const r = esquema.safeParse(objeto);
  if (!r.success) throw new ErroDeNegocio(r.error.issues[0]?.message ?? "Confira os dados do formulário.");
  return r.data;
}

/**
 * Executa a ação e transforma qualquer erro numa resposta amigável.
 * Erros inesperados são registrados no servidor e não mostram detalhes técnicos.
 */
export async function executar(fn: () => Promise<string>): Promise<Resultado> {
  const vez = Date.now();
  try {
    return { ok: true, mensagem: await fn(), vez };
  } catch (e) {
    if (e instanceof ErroDeNegocio || e instanceof ErroDeAcesso) return { ok: false, erro: e.message, vez };
    // redirect()/notFound() do Next precisam continuar subindo
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[acao] erro inesperado", e);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo em instantes.", vez };
  }
}
