"use server";

/**
 * Antes de mandar uma foto: o servidor confere quem pode enviar para aquele
 * módulo e devolve o caminho exato + uma autorização (token) que só permite
 * CRIAR aquele arquivo (as regras do Storage conferem). Veja src/lib/fotos.ts.
 *
 * - Classificados: quem pode anunciar ("classificados.usar").
 * - Comunicados: quem publica comunicados ("comunicados.publicar").
 * - Áreas de lazer: quem configura as áreas ("areas.configurar").
 * Limite de 40 fotos por pessoa a cada hora (evita encher o Storage).
 */
import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { consumirTentativa } from "../rate-limit";
import { ehModuloFoto, nomeArquivoFoto, pastaFotos, tipoFotoAceito, TAMANHO_MAXIMO_FOTO, type ModuloFoto } from "@/lib/fotos";
import type { Permissao } from "@/lib/permissoes";

export type PermissaoDeFoto = { ok: true; caminho: string; token: string } | { ok: false; erro: string };

const QUEM_ENVIA: Record<ModuloFoto, Permissao> = {
  classificados: "classificados.usar",
  comunicados: "comunicados.publicar",
  areas: "areas.configurar",
};

const LIMITE_POR_HORA = 40;

export async function prepararEnvioFoto(pedido: { modulo: string; tipo: string; tamanho: number }): Promise<PermissaoDeFoto> {
  try {
    if (!ehModuloFoto(pedido?.modulo)) return { ok: false, erro: "Envio de foto inválido." };
    const ctx = garantirPermissao(await getContexto(), QUEM_ENVIA[pedido.modulo]);
    if (typeof pedido.tipo !== "string" || !tipoFotoAceito(pedido.tipo)) {
      return { ok: false, erro: "Escolha uma foto (JPG ou PNG)." };
    }
    if (typeof pedido.tamanho !== "number" || !(pedido.tamanho > 0) || pedido.tamanho > TAMANHO_MAXIMO_FOTO) {
      return { ok: false, erro: "Foto grande demais. Tente outra foto." };
    }
    const limite = await consumirTentativa(adminDb(), "foto.envio", `${ctx.condominioId}:${ctx.uid}`, LIMITE_POR_HORA, 3600);
    if (!limite.permitido) return { ok: false, erro: "Muitas fotos enviadas em pouco tempo. Espere um pouco e tente de novo." };

    const caminho = `${pastaFotos(ctx.condominioId, pedido.modulo)}${randomUUID()}/${nomeArquivoFoto(pedido.tipo)}`;
    const token = await adminAuth().createCustomToken(ctx.uid, { envioFoto: caminho });
    return { ok: true, caminho, token };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "ErroDeAcesso") return { ok: false, erro: erro.message };
    console.error("prepararEnvioFoto", erro);
    return { ok: false, erro: "Não foi possível preparar o envio da foto. Tente de novo." };
  }
}
