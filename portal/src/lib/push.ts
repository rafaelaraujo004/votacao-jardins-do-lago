/**
 * NOTIFICAÇÕES NO CELULAR (Web Push) — regras puras, sem banco (testadas em tests/unit/push.test.ts).
 *
 * Como funciona, em linguagem simples:
 * 1. Ao entrar, o portal pede para a pessoa PERMITIR notificações. O navegador do
 *    celular cria um "endereço de entrega" só daquele aparelho (a inscrição).
 * 2. O portal guarda essa inscrição junto com quem está logado.
 * 3. Quando algo acontece (comunicado publicado, anúncio para aprovar, reserva
 *    confirmada…), o servidor manda uma mensagem curta, criptografada, para os
 *    aparelhos das pessoas certas. O celular mostra a notificação mesmo com o
 *    portal fechado; ao tocar, abre a tela certa.
 * No iPhone, só funciona com o portal INSTALADO na tela de início (regra da Apple).
 */
import { z } from "zod";

/** O que o navegador entrega ao se inscrever (PushSubscription.toJSON()). */
export const esquemaInscricao = z.object({
  endpoint: z
    .string()
    .max(2000)
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Inscrição de notificação inválida."),
  keys: z.object({
    p256dh: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+=*$/),
    auth: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+=*$/),
  }),
});
export type InscricaoPush = z.infer<typeof esquemaInscricao>;

/** O que vai dentro da notificação (o service worker do navegador lê isso). */
export type MensagemPush = {
  titulo: string;
  texto: string;
  /** Tela que abre ao tocar. Sempre um caminho interno. */
  url: string;
  /** Mesma "etiqueta" = a notificação nova substitui a antiga (não empilha). */
  tag?: string;
};

const LIMITE_TITULO = 80;
const LIMITE_TEXTO = 180;

/** Corta um texto numa palavra inteira, com reticências. */
function cortar(texto: string, maximo: number): string {
  const corrido = texto.replace(/\s+/gu, " ").trim();
  if (corrido.length <= maximo) return corrido;
  const corte = corrido.slice(0, maximo - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > maximo * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s.,;:!?-]+$/u, "")}…`;
}

/** Monta a mensagem final: textos curtos e link sempre interno (nada de mandar para outro site). */
export function montarMensagem(m: MensagemPush): MensagemPush {
  const url = m.url.startsWith("/") && !m.url.startsWith("//") ? m.url : "/";
  return {
    titulo: cortar(m.titulo, LIMITE_TITULO) || "Jardins do Lago",
    texto: cortar(m.texto, LIMITE_TEXTO),
    url,
    ...(m.tag ? { tag: m.tag.slice(0, 64) } : {}),
  };
}

/** Divide uma lista em pedaços (o Firestore aceita no máximo 30 valores num "in"). */
export function emPedacos<T>(lista: readonly T[], tamanho = 30): T[][] {
  const pedacos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) pedacos.push(lista.slice(i, i + tamanho));
  return pedacos;
}

/** O serviço de entrega respondeu que a inscrição não existe mais (aparelho desinstalou ou bloqueou). */
export function inscricaoExpirou(statusHttp: number | undefined): boolean {
  return statusHttp === 404 || statusHttp === 410;
}
