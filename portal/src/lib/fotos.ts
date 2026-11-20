/**
 * FOTOS dos classificados, dos comunicados e das áreas de lazer (regras puras, sem banco; testadas em
 * tests/unit/fotos.test.ts).
 *
 * Caminho de uma foto:
 * 1. No celular, a foto é reduzida (lado maior de 1600 px) e regravada em JPEG.
 *    Isso deixa o envio leve e APAGA os dados escondidos da foto (como a
 *    localização GPS que o celular grava).
 * 2. O servidor dá uma autorização de uso único para criar UM arquivo, num
 *    caminho exato: condominiums/{condomínio}/{classifieds|announcements|amenities}/{envio}/foto.jpg
 * 3. Ao salvar o anúncio ou o comunicado, o servidor confere no Storage cada
 *    foto (existe, é imagem, tamanho) antes de gravar.
 * 4. Ninguém lê o Storage direto: a tela pede /api/fotos/{módulo}/{id}/{n}, que
 *    confere se a pessoa pode ver aquele anúncio/comunicado antes de entregar.
 */

export const MODULOS_FOTO = ["classificados", "comunicados", "areas"] as const;
export type ModuloFoto = (typeof MODULOS_FOTO)[number];

/** Pasta de cada módulo no Storage (o mesmo nome da coleção no banco). */
export const PASTA_DO_MODULO: Record<ModuloFoto, "classifieds" | "announcements" | "amenities"> = {
  classificados: "classifieds",
  comunicados: "announcements",
  areas: "amenities",
};

export function ehModuloFoto(v: unknown): v is ModuloFoto {
  return typeof v === "string" && (MODULOS_FOTO as readonly string[]).includes(v);
}

/** No máximo 4 fotos por anúncio, comunicado ou área de lazer. */
export const MAXIMO_FOTOS = 4;

/** Tamanho máximo de cada foto JÁ REDUZIDA (5 MB). As regras do Storage repetem este número. */
export const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024;

/** Lado maior da foto depois de reduzida, em pixels. */
export const LADO_MAXIMO_FOTO = 1600;

/** Tipos aceitos. As regras do Storage repetem esta lista. */
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number];

const EXTENSAO: Record<TipoFoto, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function tipoFotoAceito(tipo: string): tipo is TipoFoto {
  return (TIPOS_FOTO as readonly string[]).includes(tipo);
}

/** Nome do arquivo dentro da pasta do envio (sempre o mesmo formato, nunca o nome original). */
export function nomeArquivoFoto(tipo: TipoFoto): string {
  return `foto.${EXTENSAO[tipo]}`;
}

/** Pasta das fotos de um módulo no condomínio. Ex.: "condominiums/jardins/classifieds/". */
export function pastaFotos(condominioId: string, modulo: ModuloFoto): string {
  return `condominiums/${condominioId}/${PASTA_DO_MODULO[modulo]}/`;
}

/** Envio = um UUID (gerado no servidor). */
const ENVIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NOME = /^foto\.(jpg|png|webp)$/;

/**
 * O caminho é de uma foto deste módulo, DESTE condomínio, no formato que o
 * servidor gera? (Evita que alguém aponte para o arquivo de outro lugar.)
 */
export function caminhoFotoValido(caminho: unknown, condominioId: string, modulo: ModuloFoto): caminho is string {
  if (typeof caminho !== "string" || caminho.length > 300) return false;
  const pasta = pastaFotos(condominioId, modulo);
  if (!caminho.startsWith(pasta)) return false;
  const [envio, nome, ...resto] = caminho.slice(pasta.length).split("/");
  return resto.length === 0 && ENVIO.test(envio ?? "") && NOME.test(nome ?? "");
}

/** Foto como fica gravada no banco (dentro do anúncio ou do comunicado). */
export type FotoGuardada = { caminho: string; tipo: TipoFoto; tamanho: number };

/** Lê a lista de fotos do banco, ignorando o que não estiver no formato certo. */
export function lerFotos(v: unknown, condominioId: string, modulo: ModuloFoto): FotoGuardada[] {
  if (!Array.isArray(v)) return [];
  const fotos: FotoGuardada[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const { caminho, tipo, tamanho } = item as Record<string, unknown>;
    if (!caminhoFotoValido(caminho, condominioId, modulo)) continue;
    if (typeof tipo !== "string" || !tipoFotoAceito(tipo)) continue;
    if (typeof tamanho !== "number" || !(tamanho > 0) || tamanho > TAMANHO_MAXIMO_FOTO) continue;
    fotos.push({ caminho, tipo, tamanho });
    if (fotos.length === MAXIMO_FOTOS) break;
  }
  return fotos;
}

/**
 * Endereço protegido da foto no portal. O "?v=" muda quando a foto é trocada,
 * para o navegador não mostrar a foto antiga guardada na memória.
 */
export function enderecoFoto(modulo: ModuloFoto, id: string, indice: number, caminho: string): string {
  const envio = caminho.split("/").at(-2) ?? "";
  return `/api/fotos/${modulo}/${encodeURIComponent(id)}/${indice}?v=${envio.slice(0, 8)}`;
}

/** Endereços das fotos de um item, na ordem. */
export function enderecosFotos(modulo: ModuloFoto, id: string, fotos: readonly FotoGuardada[]): string[] {
  return fotos.map((f, i) => enderecoFoto(modulo, id, i, f.caminho));
}

// ---------- Formulário: fotos que ficam e fotos novas ----------

/**
 * No formulário, cada foto vai num campo "fotos", na ordem em que aparece:
 * - "atual:N" = manter a N-ª foto que o item já tinha (o caminho interno não vai ao navegador);
 * - um caminho do Storage = foto nova, que acabou de ser enviada.
 */
export type FotoDoFormulario = { tipo: "atual"; indice: number } | { tipo: "nova"; caminho: string };

const ATUAL = /^atual:(\d)$/;

/**
 * Lê os valores do campo "fotos". Devolve a lista ou a mensagem de erro.
 * Não confere o Storage (isso é no servidor), só o formato e a quantidade.
 */
export function lerFotosDoFormulario(
  valores: readonly string[],
  condominioId: string,
  modulo: ModuloFoto,
): { ok: true; fotos: FotoDoFormulario[] } | { ok: false; erro: string } {
  const limpos = valores.map((v) => v.trim()).filter(Boolean);
  if (limpos.length > MAXIMO_FOTOS) return { ok: false, erro: `Escolha no máximo ${MAXIMO_FOTOS} fotos.` };
  const fotos: FotoDoFormulario[] = [];
  const vistos = new Set<string>();
  for (const v of limpos) {
    if (vistos.has(v)) continue; // a mesma foto duas vezes conta uma só
    vistos.add(v);
    const atual = ATUAL.exec(v);
    if (atual) fotos.push({ tipo: "atual", indice: Number(atual[1]) });
    else if (caminhoFotoValido(v, condominioId, modulo)) fotos.push({ tipo: "nova", caminho: v });
    else return { ok: false, erro: "Uma das fotos não foi enviada direito. Tire-a e envie de novo." };
  }
  return { ok: true, fotos };
}

/** Fotos que eram do item e não ficaram na lista nova (o servidor apaga do Storage depois de salvar). */
export function fotosRemovidas(antes: readonly FotoGuardada[], depois: readonly FotoGuardada[]): string[] {
  const ficam = new Set(depois.map((f) => f.caminho));
  return antes.map((f) => f.caminho).filter((c) => !ficam.has(c));
}

/** Novo tamanho (largura e altura) para caber no lado máximo, sem aumentar foto pequena. */
export function tamanhoReduzido(largura: number, altura: number, ladoMaximo = LADO_MAXIMO_FOTO): { largura: number; altura: number } {
  if (!(largura > 0) || !(altura > 0)) return { largura: 0, altura: 0 };
  const escala = Math.min(1, ladoMaximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}
