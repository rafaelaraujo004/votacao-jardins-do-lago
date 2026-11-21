"use server";

/**
 * Ações das ASSINATURAS DIGITAIS DA ATA da votação (veja src/server/dados/assinaturas-ata.ts).
 * - Comissão (eleicoes.gerenciar): assinar no aparelho da comissão, gerar o link para mandar
 *   pelo WhatsApp e remover uma assinatura feita por engano.
 * - Público (quem tem o link): assinar. A eleição e a vaga vêm do CÓDIGO, nunca do formulário;
 *   códigos errados contam no limite por endereço de internet (LIMITE_ATA_IP).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { enderecoBase } from "../endereco";
import {
  assinarNoAparelho,
  assinarPorCodigo,
  gerarLinkAssinatura,
  removerAssinatura,
} from "../dados/assinaturas-ata";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { idDocumento } from "@/lib/validacao";
import { MAX_IMAGEM_ASSINATURA, vagaValida } from "@/lib/assinaturas-ata";

const vaga = z.string().refine(vagaValida, "Parte da ata inválida. Atualize a página.");
const nome = z.string().max(300, "O nome pode ter até 80 letras.");
const imagem = z
  .string()
  .max(MAX_IMAGEM_ASSINATURA, "A assinatura ficou grande demais. Apague e assine de novo.");

const esquemaVaga = z.object({ id: idDocumento, vaga });
const esquemaNoAparelho = z.object({ id: idDocumento, vaga, nome, imagem });

/** Resposta do "gerar link": além da mensagem, o endereço completo para mandar. */
export type ResultadoLinkAta =
  | { ok: true; mensagem: string; link: string; vez: number }
  | { ok: false; erro: string; vez: number };

function revalidarAta(id: string) {
  revalidatePath(`/relatorio/votacao/${id}`);
  // Página pública do link (dinâmica): um link trocado ou usado deixa de abrir.
  revalidatePath("/assinar-ata/[codigo]", "page");
}

async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/** Aparelho de quem assina (o navegador); o corte em 160 letras fica nos dados. */
async function aparelhoDoPedido(): Promise<string> {
  return (await headers()).get("user-agent") ?? "";
}

/** A pessoa assina no celular (ou computador) da comissão, na própria ata. */
export async function assinarAtaNoAparelho(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = lerFormulario(esquemaNoAparelho, dados);
    const r = await assinarNoAparelho(adminDb(), ctx, v.id, {
      vaga: v.vaga,
      nome: v.nome,
      imagem: v.imagem,
      aparelho: await aparelhoDoPedido(),
    });
    revalidarAta(v.id);
    return `Assinatura de ${r.nome} (${r.papel}) registrada na ata.`;
  });
}

/**
 * Cria (ou troca) o link de assinatura de uma parte da ata e devolve o endereço completo,
 * para a tela abrir o WhatsApp com a mensagem pronta.
 */
export async function gerarLinkAssinaturaAta(id: string, vagaBruta: string): Promise<ResultadoLinkAta> {
  let link = "";
  const r = await executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = esquemaVaga.safeParse({ id, vaga: vagaBruta });
    if (!v.success) throw new ErroDeNegocio("Parte da ata inválida. Atualize a página.");
    const g = await gerarLinkAssinatura(adminDb(), ctx, v.data.id, v.data.vaga);
    link = `${await enderecoBase()}/assinar-ata/${g.codigo}`;
    revalidarAta(v.data.id);
    return `Link de assinatura (${g.papel}) pronto. Ele vale uma vez.`;
  });
  if (!r) return { ok: false, erro: "Não foi possível criar o link agora.", vez: Date.now() };
  return r.ok ? { ...r, link } : r;
}

/** Tira uma assinatura da ata (engano). A vaga volta a ficar em branco. */
export async function removerAssinaturaAta(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = lerFormulario(esquemaVaga, dados);
    const r = await removerAssinatura(adminDb(), ctx, v.id, v.vaga);
    revalidarAta(v.id);
    return `Assinatura de ${r.nome || r.papel} removida. A linha voltou a ficar em branco.`;
  });
}

/**
 * Assinatura pelo LINK (sem login). Só o código, o nome e a imagem vêm do formulário.
 * De propósito, NÃO chama revalidatePath: qualquer revalidação faz o Next desenhar de novo
 * esta mesma página, e com o código já usado ela mostraria "link inválido" (contando no
 * limite do endereço) no lugar do "Assinatura registrada". A ata da comissão é dinâmica e
 * já mostra a assinatura na próxima vez que for aberta (e a auditoria avisa as telas abertas).
 */
export async function assinarAtaPorCodigo(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const campo = (k: string) => {
      const v = dados.get(k);
      return typeof v === "string" ? v : "";
    };
    const img = campo("imagem");
    if (img.length > MAX_IMAGEM_ASSINATURA)
      throw new ErroDeNegocio("A assinatura ficou grande demais. Apague e assine de novo.");
    await assinarPorCodigo(
      campo("codigo").slice(0, 40),
      { nome: campo("nome").slice(0, 300), imagem: img, aparelho: await aparelhoDoPedido() },
      { ip: await ipDoPedido() },
    );
    return "Assinatura registrada. Obrigado! Pode fechar esta página.";
  });
}
