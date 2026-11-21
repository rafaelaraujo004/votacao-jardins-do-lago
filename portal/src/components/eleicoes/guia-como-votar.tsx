/**
 * "COMO VOTAR?" — o passo a passo com imagens, dentro de uma caixa que abre e fecha.
 * Fica na página do link de voto e na votação do morador, perto da senha/cédula, para quem
 * tiver dúvida na hora (as mesmas 9 imagens que a comissão manda pelo WhatsApp).
 * <details> funciona sem JavaScript; as imagens só carregam quando a caixa é aberta
 * (loading lazy) e têm largura/altura fixas para a página não "pular".
 *
 * Ampliar: no portal o zoom com os dedos fica desligado (para a tela não "escorregar"), e no
 * celular o texto das imagens fica pequeno. Por isso cada imagem é um link para ela mesma em
 * tamanho cheio, numa aba nova — lá dá para ampliar com os dedos. No fim, o mesmo passo a
 * passo em PDF (1 arquivo) para baixar e guardar.
 */
import Image from "next/image";
import { BookOpenText, ChevronDown, FileText, ZoomIn } from "lucide-react";
import { ALTURA_GUIA, IMAGENS_GUIA, LARGURA_GUIA, PDF_GUIA } from "@/lib/guia-votacao";
import { cx } from "@/lib/cx";

export function GuiaComoVotar({
  aberto = false,
  cartao = false,
  className,
}: {
  /** Começa aberta (padrão: fechada). */
  aberto?: boolean;
  /** Com cara de cartão (entre outros cartões); sem: bloco claro dentro de um cartão. */
  cartao?: boolean;
  className?: string;
}) {
  return (
    <details
      open={aberto}
      className={cx(
        "group",
        cartao
          ? "rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card"
          : "rounded-2xl border border-line bg-surface-item",
        className,
      )}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl p-3.5 text-left [&::-webkit-details-marker]:hidden">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
          <BookOpenText aria-hidden className="size-6" />
        </span>
        <span className="min-w-0 flex-1 text-[1.05rem] font-bold leading-snug text-destaque">
          Como votar? Veja o passo a passo com imagens
        </span>
        <ChevronDown
          aria-hidden
          className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <p className="mx-3 mb-3 flex items-center justify-center gap-2 rounded-2xl bg-lake-soft px-3 py-2.5 text-center text-[0.95rem] font-bold text-ink-2">
        <ZoomIn aria-hidden className="size-5 shrink-0 text-lake" />
        Toque na imagem para ampliar
      </p>
      <ol className="flex flex-col items-center gap-5 px-3 pb-4 pt-1">
        {IMAGENS_GUIA.map((img) => (
          <li key={img.src} className="w-full max-w-[420px]">
            <figure className="flex flex-col gap-2">
              <a
                href={img.src}
                target="_blank"
                rel="noopener"
                className="relative block rounded-2xl"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  width={LARGURA_GUIA}
                  height={ALTURA_GUIA}
                  sizes="(min-width: 480px) 420px, 90vw"
                  loading="lazy"
                  className="h-auto w-full rounded-2xl border border-line"
                />
                {/* Lupa no canto (sem texto em cima do conteúdo da imagem). */}
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-full bg-black/55 text-white"
                >
                  <ZoomIn className="size-5" />
                </span>
                <span className="sr-only"> (abre a imagem em tamanho cheio, em outra aba)</span>
              </a>
              <figcaption className="flex flex-col gap-0.5 text-center">
                <span className="text-[0.95rem] font-bold text-ink-2">{img.titulo}</span>
                <span className="break-words text-ink">{img.texto}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
      <div className="flex justify-center px-3 pb-5">
        <a
          href={PDF_GUIA.src}
          download={PDF_GUIA.arquivo}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-center font-bold leading-tight saltado text-ink hover:text-pine"
        >
          <FileText aria-hidden className="size-5 shrink-0" />
          Baixar o passo a passo em PDF
        </a>
      </div>
    </details>
  );
}
