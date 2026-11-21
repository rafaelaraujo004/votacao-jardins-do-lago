/**
 * ASSINATURAS DIGITAIS DA ATA da votação (lógica pura, sem banco; testada em
 * tests/unit/assinaturas-ata.test.ts).
 *
 * Pedido do dono (21/11/2026): as assinaturas da ata (relatório final) são feitas no celular,
 * com o dedo, como já fazemos no berçário Pingo de Gente. Cada parte da ata é uma "vaga" fixa:
 * duas da comissão eleitoral, o(a) síndico(a) e uma testemunha. Quem assina escreve o NOME
 * COMPLETO e passa o dedo no quadro; a imagem vira um PNG pequeno guardado junto da eleição.
 *
 * Aqui ficam só a lista das vagas e as conferências do nome e da imagem — usadas no navegador
 * (para habilitar o botão) e no servidor (que confere de novo antes de gravar).
 */

export const VAGAS_ATA = [
  { id: "comissao-1", papel: "Comissão eleitoral" },
  { id: "comissao-2", papel: "Comissão eleitoral" },
  { id: "sindico", papel: "Síndico(a)" },
  { id: "testemunha", papel: "Testemunha" },
] as const;

export type VagaAta = (typeof VAGAS_ATA)[number]["id"];

export const IDS_VAGAS_ATA: readonly VagaAta[] = VAGAS_ATA.map((v) => v.id);

export function vagaValida(v: unknown): v is VagaAta {
  return typeof v === "string" && (IDS_VAGAS_ATA as readonly string[]).includes(v);
}

export function papelDaVaga(v: VagaAta): string {
  return VAGAS_ATA.find((x) => x.id === v)?.papel ?? "Assinatura";
}

/** Como a assinatura chegou: no celular da comissão ("aparelho") ou pelo link do WhatsApp. */
export type ViaAssinatura = "aparelho" | "link";

export const MAX_NOME_ASSINATURA = 80;
/** Tamanho máximo do texto da imagem (data URL). Um PNG de 600 px de largura fica bem abaixo. */
export const MAX_IMAGEM_ASSINATURA = 150_000;
/** O navegador reduz a assinatura para no máximo esta largura antes de enviar. */
export const LARGURA_MAX_ASSINATURA = 600;
/** Altura máxima aceita (o quadro tem ~180 px; com a tela do celular deitada, um pouco mais). */
export const ALTURA_MAX_ASSINATURA = 600;
/** O aparelho (navegador) fica registrado só até este tamanho. */
export const MAX_APARELHO = 160;

/** Junta espaços repetidos e tira os das pontas. */
export function limparNome(bruto: string): string {
  return bruto.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Palavras do nome que têm pelo menos uma letra ("da", "de" contam; "-" sozinho não). */
function palavras(nome: string): string[] {
  return nome.split(" ").filter((p) => /\p{L}/u.test(p));
}

/** true se o nome (já limpo ou não) parece um nome completo: duas palavras ou mais. */
export function nomeCompletoOk(bruto: string): boolean {
  return validarNomeCompleto(bruto).ok;
}

export function validarNomeCompleto(bruto: unknown): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = limparNome(typeof bruto === "string" ? bruto : "");
  if (!nome) return { ok: false, erro: "Escreva o seu nome completo." };
  if (nome.length > MAX_NOME_ASSINATURA)
    return { ok: false, erro: `O nome pode ter até ${MAX_NOME_ASSINATURA} letras.` };
  // Letras (com acento), espaço, apóstrofo, ponto e hífen. Nada de números ou símbolos.
  if (!/^[\p{L}\p{M}' .-]+$/u.test(nome))
    return { ok: false, erro: "Use só letras no nome (sem números ou símbolos)." };
  if (palavras(nome).length < 2)
    return { ok: false, erro: "Escreva o nome completo, com nome e sobrenome." };
  return { ok: true, nome };
}

const PREFIXO_PNG = "data:image/png;base64,";
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Primeiros bytes do base64 (só o começo: o suficiente para o cabeçalho do PNG). */
function bytesDoInicio(base64: string, quantos: number): number[] | null {
  try {
    const trecho = base64.slice(0, Math.ceil(quantos / 3) * 4);
    const bin = atob(trecho);
    return Array.from(bin.slice(0, quantos), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const inteiro32 = (b: number[], i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/**
 * Confere a imagem da assinatura: PNG de verdade (assinatura do arquivo e cabeçalho IHDR),
 * em "data URL", sem caracteres estranhos, até ~150 KB de texto e com tamanho razoável.
 */
export function validarImagemAssinatura(
  bruto: unknown,
): { ok: true; imagem: string; largura: number; altura: number } | { ok: false; erro: string } {
  const falhou = { ok: false as const, erro: "A assinatura não chegou certa. Apague e assine de novo." };
  if (typeof bruto !== "string" || !bruto) return { ok: false, erro: "Passe o dedo dentro do quadro para assinar." };
  if (bruto.length > MAX_IMAGEM_ASSINATURA)
    return { ok: false, erro: "A assinatura ficou grande demais. Apague e assine de novo, sem rabiscar o quadro todo." };
  if (!bruto.startsWith(PREFIXO_PNG)) return falhou;
  const base64 = bruto.slice(PREFIXO_PNG.length);
  if (base64.length < 64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return falhou;
  // 8 bytes da assinatura + 4 do tamanho + "IHDR" + 4 da largura + 4 da altura = 24 bytes.
  const b = bytesDoInicio(base64, 24);
  if (!b || b.length < 24) return falhou;
  if (ASSINATURA_PNG.some((x, i) => b[i] !== x)) return falhou;
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return falhou;
  const largura = inteiro32(b, 16);
  const altura = inteiro32(b, 20);
  if (!largura || !altura || largura > LARGURA_MAX_ASSINATURA || altura > ALTURA_MAX_ASSINATURA) return falhou;
  return { ok: true, imagem: bruto, largura, altura };
}

/** Aparelho registrado com a assinatura: o "user-agent" do navegador, cortado. */
export function resumoAparelho(userAgent: string | null | undefined): string {
  return (userAgent ?? "").replace(/\p{Cc}/gu, "").trim().slice(0, MAX_APARELHO) || "desconhecido";
}

/** Mensagem curta do WhatsApp com o link de assinatura. */
export function mensagemLinkAssinatura(titulo: string, papel: string, link: string): string {
  return `Olá! Assine a ata da votação ${titulo} (${papel}) pelo link: ${link} — o link vale uma vez.`;
}
