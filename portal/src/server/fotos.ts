import "server-only";
import { adminBalde } from "./firebase-admin";
import { ErroDeNegocio } from "./acoes/resultado";
import {
  TAMANHO_MAXIMO_FOTO,
  caminhoFotoValido,
  lerFotosDoFormulario,
  tipoFotoAceito,
  type FotoGuardada,
  type ModuloFoto,
} from "@/lib/fotos";

/**
 * Fotos no servidor: confere no Storage as fotos que o navegador diz ter enviado
 * e apaga as que saíram. Veja as regras em src/lib/fotos.ts.
 */

/** Confere UMA foto nova no Storage (existe, é imagem aceita e o tamanho). Apaga se não servir. */
async function conferirFotoNova(caminho: string, condominioId: string, modulo: ModuloFoto): Promise<FotoGuardada> {
  if (!caminhoFotoValido(caminho, condominioId, modulo)) {
    throw new ErroDeNegocio("Uma das fotos não foi enviada direito. Tire-a e envie de novo.");
  }
  const arquivo = adminBalde().file(caminho);
  const [existe] = await arquivo.exists();
  if (!existe) throw new ErroDeNegocio("Uma das fotos não chegou ao portal. Espere o envio terminar ou envie de novo.");
  const [meta] = await arquivo.getMetadata();
  const tamanho = Number(meta.size ?? 0);
  const tipo = String(meta.contentType ?? "");
  if (!tipoFotoAceito(tipo) || !(tamanho > 0) || tamanho > TAMANHO_MAXIMO_FOTO) {
    await arquivo.delete({ ignoreNotFound: true });
    throw new ErroDeNegocio("Uma das fotos não foi aceita (tipo ou tamanho). Envie uma foto JPG ou PNG.");
  }
  return { caminho, tipo, tamanho };
}

/**
 * Transforma os campos "fotos" do formulário na lista final, na ordem escolhida.
 * - "atual:N" mantém a foto N que o item já tinha;
 * - caminho novo é conferido no Storage.
 * Chame ANTES da transação (o Storage não entra nela).
 */
export async function fotosDoFormulario(
  valores: readonly string[],
  condominioId: string,
  modulo: ModuloFoto,
  atuais: readonly FotoGuardada[] = [],
): Promise<FotoGuardada[]> {
  const lido = lerFotosDoFormulario(valores, condominioId, modulo);
  if (!lido.ok) throw new ErroDeNegocio(lido.erro);
  const lista: FotoGuardada[] = [];
  for (const f of lido.fotos) {
    if (f.tipo === "atual") {
      const atual = atuais[f.indice];
      if (!atual) throw new ErroDeNegocio("As fotos mudaram enquanto você editava. Atualize a página e tente de novo.");
      lista.push(atual);
    } else {
      lista.push(await conferirFotoNova(f.caminho, condominioId, modulo));
    }
  }
  return lista;
}

/** Apaga fotos do Storage sem travar a tela se der errado (o item já foi salvo). */
export async function apagarFotos(caminhos: readonly string[]): Promise<void> {
  await Promise.all(
    caminhos.map(async (caminho) => {
      try {
        await adminBalde().file(caminho).delete({ ignoreNotFound: true });
      } catch (erro) {
        console.error("Não foi possível apagar a foto antiga", caminho, erro);
      }
    }),
  );
}
