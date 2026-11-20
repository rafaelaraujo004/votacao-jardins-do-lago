"use server";

/**
 * Ações do LINK DE VOTO por casa e dos CONTATOS (WhatsApp).
 * - Comissão (eleicoes.gerenciar): gerar/trocar links, importar a lista do Word, marcar envio.
 * - Público (quem tem o link): votar. A casa e a eleição vêm do CÓDIGO, nunca do formulário.
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { adminDb } from "../firebase-admin";
import { marcarMudancaDepois } from "../sinais";
import { garantirPermissao, getContexto } from "../contexto";
import { ErroDocx, lerTabelasDocx } from "../docx";
import {
  conferirSenha,
  cookieDoLink,
  gerarLinksFaltantes,
  limparCodigo,
  importarContatos,
  marcarEnviado,
  trocarLink,
  votarPorCodigo,
} from "../dados/votacao-links";
import {
  ErroDeNegocio,
  executar,
  lerFormulario,
  type Resultado,
} from "./resultado";
import {
  esquemaIdEleicao,
  esquemaLinkCasa,
  esquemaVotoLink,
} from "@/lib/validacao-eleicoes";
import { lerTabelaContatos } from "@/lib/contatos-votacao";

function revalidarGestao(id: string) {
  revalidatePath(`/admin/votacao/${id}`);
  revalidatePath(`/admin/votacao/${id}/links`);
}

async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido"
  );
}

export async function gerarLinksEleicao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id } = lerFormulario(esquemaIdEleicao, dados);
    const r = await gerarLinksFaltantes(adminDb(), ctx, id);
    revalidarGestao(id);
    return r.gerados === 0
      ? "Todas as casas ativas já têm link."
      : `${r.gerados} ${r.gerados === 1 ? "link criado" : "links criados"}. Agora é só enviar pelo WhatsApp.`;
  });
}

export async function trocarLinkCasa(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const { id, unitId } = lerFormulario(esquemaLinkCasa, dados);
    await trocarLink(adminDb(), ctx, id, unitId);
    revalidarGestao(id);
    return "Link trocado. O link antigo não funciona mais — envie o novo.";
  });
}

/** Chamada pelo botão do WhatsApp depois de abrir a conversa (só para acompanhar quem já recebeu). */
export async function marcarEnvioWhatsApp(
  id: string,
  unitId: string,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const v = esquemaLinkCasa.safeParse({ id, unitId });
    if (!v.success) throw new ErroDeNegocio("Casa inválida.");
    await marcarEnviado(adminDb(), ctx, v.data.id, v.data.unitId);
    revalidarGestao(v.data.id);
    return "Envio anotado.";
  });
}

/** Importa a lista do Word (colunas CASA, NOME, CONTATOS). */
export async function importarContatosVotacao(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "eleicoes.gerenciar");
    const arquivo = dados.get("arquivo");
    const id = String(dados.get("id") ?? "");
    if (!(arquivo instanceof File) || arquivo.size === 0)
      throw new ErroDeNegocio("Escolha o arquivo do Word (.docx) com a lista.");
    if (!/\.docx$/i.test(arquivo.name))
      throw new ErroDeNegocio("Use o arquivo do Word no formato .docx.");
    let tabelas: string[][][];
    try {
      tabelas = lerTabelasDocx(Buffer.from(await arquivo.arrayBuffer()));
    } catch (e) {
      if (e instanceof ErroDocx) throw new ErroDeNegocio(e.message);
      throw e;
    }
    // Junta todas as tabelas com 3 colunas ou mais (a lista pode estar dividida em várias tabelas).
    const linhas = tabelas.filter((t) => t.some((l) => l.length >= 3)).flat();
    const { contatos, avisos } = lerTabelaContatos(
      linhas.length ? linhas : tabelas[0],
    );
    if (!contatos.length)
      throw new ErroDeNegocio(
        "Não encontrei casas na tabela. Confira as colunas CASA, NOME e CONTATOS.",
      );
    const r = await importarContatos(adminDb(), ctx, contatos);
    if (/^[A-Za-z0-9_-]{1,64}$/.test(id)) revalidarGestao(id);
    const partes = [
      `${r.gravados} ${r.gravados === 1 ? "casa importada" : "casas importadas"}.`,
    ];
    if (r.ambiguas.length)
      partes.push(
        `Número repetido no cadastro (não importado): casa ${r.ambiguas.join(", ")}.`,
      );
    if (r.semTelefone.length)
      partes.push(
        `Sem telefone na lista (mantive o que havia): casa ${r.semTelefone.join(", ")}.`,
      );
    if (r.semCadastro.length)
      partes.push(`Sem cadastro no portal: casa ${r.semCadastro.join(", ")}.`);
    if (avisos.length)
      partes.push(
        `Avisos: ${avisos.slice(0, 5).join(" ")}${avisos.length > 5 ? ` (+${avisos.length - 5})` : ""}`,
      );
    return partes.join(" ");
  });
}

/**
 * Voto pelo link da casa (sem login). O limite por endereço conta só tentativas ERRADAS
 * (link inválido, sem a senha certa): votar de verdade nunca gasta tentativas, porque
 * muitas casas votam atrás do mesmo endereço de internet (veja LIMITE_IP).
 */
export async function votarComCodigo(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    const v = lerFormulario(esquemaVotoLink, dados);
    try {
      const token = (await cookies()).get(cookieDoLink(v.codigo))?.value ?? null;
      const { condominioId } = await votarPorCodigo(v.codigo, token, v.escolha, adminDb(), await ipDoPedido());
      // Avisa as telas da comissão depois de responder (fora da transação do voto).
      after(() => marcarMudancaDepois(adminDb(), condominioId, "eleicoes"));
    } catch (e) {
      const codigo =
        e && typeof e === "object" && "code" in e
          ? (e as { code: unknown }).code
          : null;
      if (codigo === 6 || codigo === "already-exists")
        throw new ErroDeNegocio(
          "O voto desta casa já foi realizado. Cada casa vota uma vez.",
        );
      throw e;
    }
    revalidatePath(`/votar/${v.codigo}`);
    // De propósito, a resposta NÃO repete a escolha.
    return "Voto registrado com sucesso. Obrigado por votar!";
  });
}

/** Senha do link de voto. Acertou: guarda um cookie só deste link (6 horas) e mostra a cédula. */
export async function entrarComSenha(
  _: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(async () => {
    // Os limites (por link, por aparelho e por endereço) ficam em conferirSenha e contam
    // só as tentativas ERRADAS: acertar a senha nunca gasta tentativas.
    const codigo = limparCodigo(String(dados.get("codigo") ?? ""));
    const senha = String(dados.get("senha") ?? "").replace(/\D/g, "");
    if (!codigo)
      throw new ErroDeNegocio(
        "Senha errada ou link inválido. Confira a mensagem que você recebeu.",
      );
    if (senha.length !== 6)
      throw new ErroDeNegocio(
        "A senha tem 6 números. Confira na mensagem que você recebeu.",
      );
    const r = await conferirSenha(codigo, senha, await ipDoPedido());
    if (!r.ok) throw new ErroDeNegocio(r.erro);
    (await cookies()).set(cookieDoLink(codigo), r.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/votar/${codigo}`,
      maxAge: 6 * 60 * 60,
    });
    revalidatePath(`/votar/${codigo}`);
    return "Senha certa! Agora é só escolher e confirmar.";
  });
}
