"use client";

/**
 * MANDAR O PASSO A PASSO (WhatsApp): as 9 imagens ou o PDF único com as mesmas 9 páginas.
 *
 * O link wa.me abre a conversa certa com o texto, mas NÃO anexa arquivos. Por isso o passo a
 * passo vai num segundo toque, pelo "Compartilhar" do próprio celular (navigator.share com
 * arquivos): a conversa que acabou de ser aberta aparece primeiro na lista do WhatsApp.
 *
 * - Formato "imagens" (padrão): manda as 9 imagens (IMAGENS_GUIA). Se o celular não aceitar as
 *   9 juntas (canShare falso, ou o "Compartilhar" dá erro que não é a pessoa desistir), manda
 *   SOZINHO o PDF (PDF_GUIA, 1 arquivo) e avisa. Daí em diante, nesta página, os botões de
 *   imagens já vão direto no PDF (não adianta insistir no que o celular recusou).
 * - Formato "pdf": manda só o PDF.
 * - Os arquivos são buscados uma vez e ficam guardados na memória da página: a comissão manda
 *   para várias casas seguidas, e do 2º toque em diante o envio é na hora.
 * - O celular só deixa abrir o "Compartilhar" logo depois do toque. Se a busca demorar e o
 *   celular recusar, o botão vira "… pronto(s): toque de novo" (aí já vai direto).
 * - No computador (ou aparelho sem "Compartilhar" com arquivos) abre uma janela para baixar o
 *   PDF ou as imagens e arrastar para o WhatsApp Web (plano B).
 */
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Download, FileText, Images, LoaderCircle, Monitor, Share2, X } from "lucide-react";
import { IMAGENS_GUIA, LARGURA_GUIA, ALTURA_GUIA, PDF_GUIA } from "@/lib/guia-votacao";
import { classesDoBotao } from "@/components/ui/botao";
import { useAvisos } from "@/components/ui/avisos";
import { cx } from "@/lib/cx";

// ---------- Memória dos arquivos (vale para todos os botões da página) ----------

let prontas: File[] | null = null;
let buscando: Promise<File[]> | null = null;
let pdfPronto: File | null = null;
let buscandoPdf: Promise<File> | null = null;
/** O celular já recusou as 9 imagens juntas: nesta página, "imagens" vai direto no PDF. */
let imagensRecusadas = false;
/** O aviso "mandamos em PDF" aparece uma vez por página (não a cada casa). */
let avisouTroca = false;

async function baixarArquivo(src: string, nome: string, tipo: string): Promise<File> {
  const r = await fetch(src, { cache: "force-cache" });
  if (!r.ok) throw new Error(`arquivo ${src}: ${r.status}`);
  const blob = await r.blob();
  return new File([blob], nome, { type: tipo });
}

function buscarImagens(): Promise<File[]> {
  if (prontas) return Promise.resolve(prontas);
  buscando ??= Promise.all(IMAGENS_GUIA.map((img) => baixarArquivo(img.src, img.arquivo, "image/jpeg")))
    .then((arquivos) => (prontas = arquivos))
    .finally(() => {
      // Deu certo: fica em "prontas". Deu errado: o próximo toque tenta de novo.
      buscando = null;
    });
  return buscando;
}

function buscarPdf(): Promise<File> {
  if (pdfPronto) return Promise.resolve(pdfPronto);
  buscandoPdf ??= baixarArquivo(PDF_GUIA.src, PDF_GUIA.arquivo, "application/pdf")
    .then((pdf) => (pdfPronto = pdf))
    .finally(() => {
      buscandoPdf = null;
    });
  return buscandoPdf;
}

/** O aparelho sabe compartilhar arquivos de imagem? (testa com um arquivo minúsculo) */
function compartilhaArquivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const teste = new File([new Uint8Array([0xff, 0xd8, 0xff])], "teste.jpg", { type: "image/jpeg" });
    return navigator.canShare({ files: [teste] });
  } catch {
    return false;
  }
}

/** O "Compartilhar" aceita ESTES arquivos juntos? (alguns celulares limitam quantidade/tipo) */
function aceita(arquivos: File[]): boolean {
  try {
    return navigator.canShare({ files: arquivos });
  } catch {
    return false;
  }
}

/** Celular ou tablet (tela de toque como principal). No computador vale o plano B. */
function ehCelular(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

function nomeDoErro(erro: unknown): string {
  return erro && typeof erro === "object" && "name" in erro ? String(erro.name) : "";
}

type Formato = "imagens" | "pdf";
type Estado = "parado" | "preparando" | "pronto";
/** "compacto": botão da linha de cada casa; "mini": botão menor, com cara de link (ex.: "ou PDF"). */
type Variante = "primario" | "secundario" | "compacto" | "mini";
type Resultado = { tipo: "ok" } | { tipo: "cancelou" } | { tipo: "erro"; nome: string; erro: unknown };

const AVISO_TROCA = `O WhatsApp não aceitou as ${IMAGENS_GUIA.length} imagens; mandamos o passo a passo em PDF (1 arquivo).`;

export function EnviarImagensGuia({
  texto,
  rotulo,
  descricao,
  className,
  variante = "secundario",
  formato = "imagens",
}: {
  /** Texto que vai junto (ex.: explicação para o grupo). Sem texto: só os arquivos. */
  texto?: string;
  rotulo?: string;
  /** Complemento só para leitores de tela, quando o rótulo é curto (ex.: "ou PDF"). */
  descricao?: string;
  className?: string;
  variante?: Variante;
  /** "imagens" (padrão, cai no PDF se o celular recusar) ou "pdf" (só o PDF). */
  formato?: Formato;
}) {
  const [estado, setEstado] = useState<Estado>("parado");
  // O que está sendo preparado/está pronto: muda o texto do botão ("imagens" ou "PDF").
  const [qual, setQual] = useState<Formato>(formato);
  const [planoB, setPlanoB] = useState(false);
  const compartilhando = useRef(false);
  const { avisar } = useAvisos();

  // No celular, adianta a busca com a página parada: o 1º toque já abre o "Compartilhar".
  // (Uma busca só para todos os botões da página.) Nas imagens, já confere se o celular aceita
  // as 9 juntas; se não aceitar, deixa o PDF pronto no lugar delas.
  useEffect(() => {
    if (!ehCelular() || !compartilhaArquivos()) return;
    const espera = window.setTimeout(
      () => {
        const preparo =
          formato === "pdf" || imagensRecusadas
            ? buscarPdf()
            : buscarImagens().then((arquivos) => {
                if (aceita(arquivos)) return;
                imagensRecusadas = true;
                return buscarPdf();
              });
        preparo.catch(() => {
          /* sem internet agora: o toque tenta de novo e avisa */
        });
      },
      // O PDF depois das imagens (as imagens são o envio mais comum).
      formato === "pdf" ? 3000 : 1500,
    );
    return () => window.clearTimeout(espera);
  }, [formato]);

  async function compartilhar(arquivos: File[]): Promise<Resultado> {
    compartilhando.current = true;
    try {
      // O WhatsApp do iPhone costuma jogar fora o texto que vai junto com arquivos: copia antes,
      // para a pessoa poder colar na conversa (sem esperar: o "Compartilhar" precisa do toque).
      if (texto) {
        void navigator.clipboard?.writeText(texto).then(
          () => avisar("info", "O texto também foi copiado: se não aparecer no grupo, segure o dedo na conversa e escolha Colar."),
          () => undefined,
        );
      }
      await navigator.share(texto ? { files: arquivos, text: texto } : { files: arquivos });
      return { tipo: "ok" };
    } catch (erro) {
      const nome = nomeDoErro(erro);
      // AbortError: a pessoa fechou o "Compartilhar" (nada a avisar).
      return nome === "AbortError" ? { tipo: "cancelou" } : { tipo: "erro", nome, erro };
    } finally {
      compartilhando.current = false;
    }
  }

  /**
   * Manda o PDF. `trocouImagens`: veio no lugar das imagens (avisa). `semToqueNovo`: o toque
   * já foi gasto (busca demorada ou "Compartilhar" que falhou) — se o celular recusar por isso,
   * pede um toque novo em vez de cair no plano B.
   */
  async function mandarPdf(o: { trocouImagens: boolean; semToqueNovo?: boolean }) {
    let pdf = pdfPronto;
    const precisouBuscar = !pdf;
    if (!pdf) {
      setQual("pdf");
      setEstado("preparando");
      try {
        pdf = await buscarPdf();
      } catch (erro) {
        console.error("PDF do passo a passo: não foi possível buscar", erro);
        avisar("erro", "Não deu para preparar o PDF. Confira a internet e tente de novo.");
        setEstado("parado");
        return;
      }
    }

    if (!aceita([pdf])) {
      setEstado("parado");
      setPlanoB(true);
      return;
    }

    const r = await compartilhar([pdf]);
    if (r.tipo === "ok") {
      setEstado("parado");
      if (o.trocouImagens && !avisouTroca) {
        avisouTroca = true;
        avisar("info", AVISO_TROCA);
      }
    } else if (r.tipo === "cancelou") {
      setEstado("parado");
    } else if (r.nome === "NotAllowedError" && (precisouBuscar || o.semToqueNovo)) {
      // O celular não deixou abrir sem um toque novo: o PDF já está pronto.
      setQual("pdf");
      setEstado("pronto");
    } else {
      console.error("PDF do passo a passo: o compartilhamento falhou", r.erro);
      setEstado("parado");
      setPlanoB(true);
    }
  }

  async function mandarImagens() {
    let arquivos = prontas;
    const precisouBuscar = !arquivos;
    if (!arquivos) {
      setQual("imagens");
      setEstado("preparando");
      try {
        arquivos = await buscarImagens();
      } catch (erro) {
        console.error("Imagens do passo a passo: não foi possível buscar", erro);
        avisar("erro", "Não deu para preparar as imagens. Confira a internet e tente de novo.");
        setEstado("parado");
        return;
      }
    }

    if (!aceita(arquivos)) {
      // O celular não aceita as 9 juntas: vai o PDF (1 arquivo) no lugar.
      imagensRecusadas = true;
      await mandarPdf({ trocouImagens: true, semToqueNovo: precisouBuscar });
      return;
    }

    const r = await compartilhar(arquivos);
    if (r.tipo === "ok" || r.tipo === "cancelou") {
      setEstado("parado");
    } else if (r.nome === "NotAllowedError" && precisouBuscar) {
      // A busca demorou e o celular não deixou abrir sem um toque novo.
      setQual("imagens");
      setEstado("pronto");
    } else {
      // Recusou as 9 imagens: tenta o PDF (se o toque já foi gasto, pede um toque novo).
      console.error("Imagens do passo a passo: o compartilhamento falhou; tentando o PDF", r.erro);
      imagensRecusadas = true;
      await mandarPdf({ trocouImagens: true, semToqueNovo: true });
    }
  }

  async function tocar() {
    if (estado === "preparando" || compartilhando.current) return;
    if (!ehCelular() || !compartilhaArquivos()) {
      setPlanoB(true);
      return;
    }
    if (formato === "pdf" || imagensRecusadas) {
      await mandarPdf({ trocouImagens: formato === "imagens" });
    } else {
      await mandarImagens();
    }
  }

  const preparando = estado === "preparando";
  const pronto = estado === "pronto";
  const ehPdf = qual === "pdf";
  const textoBotao = preparando
    ? ehPdf
      ? "Preparando o PDF…"
      : "Preparando as imagens…"
    : pronto
      ? ehPdf
        ? "PDF pronto: toque de novo"
        : "Imagens prontas: toque de novo"
      : (rotulo ?? (formato === "pdf" ? "Mandar o passo a passo em PDF" : "Mandar as imagens do passo a passo"));
  const anuncio = preparando
    ? ehPdf
      ? "Preparando o PDF."
      : "Preparando as imagens."
    : pronto
      ? ehPdf
        ? "O PDF está pronto. Toque de novo no botão para enviar."
        : "As imagens estão prontas. Toque de novo no botão para enviar."
      : "";
  const Icone = preparando ? LoaderCircle : pronto ? Share2 : formato === "pdf" ? FileText : Images;

  return (
    <>
      <button
        type="button"
        onClick={tocar}
        aria-busy={preparando || undefined}
        className={cx(
          variante === "compacto"
            ? "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.92rem] font-bold saltado text-ink transition-shadow hover:text-pine active:shadow-afundado"
            : variante === "mini"
              ? "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.88rem] font-bold text-lake transition-shadow hover:shadow-afundado active:shadow-afundado"
              : classesDoBotao(variante),
          pronto && "ring-2 ring-pine",
          className,
        )}
      >
        <Icone aria-hidden className={cx("size-4 shrink-0", preparando && "animate-spin motion-reduce:animate-none")} />
        {textoBotao}
        {descricao && !preparando && !pronto ? <span className="sr-only"> — {descricao}</span> : null}
      </button>
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
      {planoB ? <JanelaBaixar aoFechar={() => setPlanoB(false)} texto={texto} formato={formato} /> : null}
    </>
  );
}

// ---------- Plano B: baixar o PDF ou as imagens (computador) ----------

function JanelaBaixar({ aoFechar, texto, formato }: { aoFechar: () => void; texto?: string; formato: Formato }) {
  const janela = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [baixando, setBaixando] = useState(false);
  const [textoCopiado, setTextoCopiado] = useState(false);
  const { avisar } = useAvisos();

  useEffect(() => {
    const d = janela.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Baixa uma por uma (um pouco de espera entre elas para o navegador não juntar nem recusar).
  async function baixarTodas() {
    const d = janela.current;
    if (!d || baixando) return;
    setBaixando(true);
    try {
      for (const [i, img] of IMAGENS_GUIA.entries()) {
        const a = document.createElement("a");
        a.href = img.src;
        a.download = img.arquivo;
        // Dentro da janela: com ela aberta, o resto da página não aceita cliques.
        d.appendChild(a);
        a.click();
        a.remove();
        if (i < IMAGENS_GUIA.length - 1) await new Promise((r) => window.setTimeout(r, 600));
      }
    } finally {
      setBaixando(false);
    }
  }

  async function copiarTexto() {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setTextoCopiado(true);
      window.setTimeout(() => setTextoCopiado(false), 2000);
    } catch {
      avisar("erro", "Não deu para copiar o texto.");
    }
  }

  return (
    <dialog
      ref={janela}
      onClose={aoFechar}
      aria-labelledby={idTitulo}
      className="m-auto max-h-[90dvh] w-[min(92vw,40rem)] overflow-y-auto rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="text-xl font-bold text-destaque">
            {formato === "pdf" ? "Passo a passo em PDF" : "Imagens do passo a passo"}
          </h2>
          <button
            type="button"
            onClick={() => janela.current?.close()}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
            aria-label="Fechar"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <p className="flex items-start gap-2 rounded-2xl bg-lake-soft px-4 py-3 text-ink-2">
          <Monitor aria-hidden className="mt-0.5 size-5 shrink-0 text-lake" />
          <span>
            {ehCelular()
              ? "Baixe o PDF (1 arquivo) ou as imagens e, na conversa do WhatsApp, toque no clipe para anexar."
              : "No computador: baixe o PDF (1 arquivo) ou as imagens e arraste para a conversa do WhatsApp Web."}
          </span>
        </p>

        <div className="flex flex-wrap gap-2">
          {/* O PDF primeiro: 1 arquivo só, mais fácil de arrastar e de o WhatsApp aceitar. */}
          <a
            href={PDF_GUIA.src}
            download={PDF_GUIA.arquivo}
            className={cx(classesDoBotao("primario"), "w-full sm:w-auto")}
          >
            <FileText aria-hidden className="size-5 shrink-0" />
            Baixar o PDF (1 arquivo, {PDF_GUIA.paginas} páginas)
          </a>
          <button
            type="button"
            onClick={baixarTodas}
            disabled={baixando}
            aria-busy={baixando || undefined}
            className={classesDoBotao("secundario")}
          >
            {baixando ? (
              <LoaderCircle aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download aria-hidden className="size-5" />
            )}
            {baixando ? "Baixando…" : `Baixar todas (${IMAGENS_GUIA.length})`}
          </button>
          {texto ? (
            <button type="button" onClick={copiarTexto} className={classesDoBotao("secundario")}>
              {textoCopiado ? "Texto copiado" : "Copiar o texto"}
            </button>
          ) : null}
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {IMAGENS_GUIA.map((img) => (
            <li key={img.src} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface-item p-2">
              <Image
                src={img.src}
                alt={img.alt}
                width={LARGURA_GUIA}
                height={ALTURA_GUIA}
                sizes="(min-width: 640px) 12rem, 42vw"
                className="h-auto w-full rounded-xl"
              />
              <p className="min-h-[2.5em] text-[0.82rem] font-bold leading-tight text-ink-2">{img.titulo}</p>
              <a
                href={img.src}
                download={img.arquivo}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[0.88rem] font-bold text-lake saltado hover:text-pine"
              >
                <Download aria-hidden className="size-4" /> Baixar
              </a>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
