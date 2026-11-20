"use client";

/**
 * Fotos de um anúncio ou comunicado.
 * - "cartao": a capa grande (com "+2" se houver mais), para as listas;
 * - "pagina": todas as fotos lado a lado, para a página do comunicado.
 * Tocar numa foto abre a foto inteira na tela (com anterior/próxima). Esc fecha.
 * As fotos vêm do endereço protegido do portal (/api/fotos/...).
 */
import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cx } from "@/lib/cx";

export function GaleriaFotos({
  fotos,
  titulo,
  variante = "cartao",
  className,
}: {
  fotos: string[];
  /** Nome do anúncio/comunicado (para o texto alternativo). */
  titulo: string;
  variante?: "cartao" | "pagina";
  className?: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [aberta, setAberta] = useState(0);
  if (!fotos.length) return null;

  function abrir(indice: number) {
    setAberta(indice);
    dialogo.current?.showModal();
  }
  const passar = (passo: number) => setAberta((i) => (i + passo + fotos.length) % fotos.length);

  const botaoFoto = (url: string, indice: number, classe: string, extra?: ReactNode) => (
    <button
      key={url}
      type="button"
      onClick={() => abrir(indice)}
      className={cx("relative block overflow-hidden rounded-2xl bg-surface-2", classe)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- foto protegida do portal (sem otimizador de imagem) */}
      <img src={url} alt={`${titulo} — foto ${indice + 1} de ${fotos.length}`} loading="lazy" decoding="async" className="size-full object-cover" />
      {extra}
      <span className="sr-only">Ampliar</span>
    </button>
  );

  return (
    <div className={className}>
      {variante === "cartao" ? (
        botaoFoto(
          fotos[0],
          0,
          "aspect-[4/3] w-full",
          fotos.length > 1 ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2.5 py-0.5 text-[0.84rem] font-bold text-white">
              +{fotos.length - 1} {fotos.length === 2 ? "foto" : "fotos"}
            </span>
          ) : null,
        )
      ) : (
        <div className={cx("grid gap-2", fotos.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {fotos.map((url, i) => botaoFoto(url, i, fotos.length === 1 ? "aspect-[4/3] w-full" : "aspect-square w-full"))}
        </div>
      )}

      <dialog
        ref={dialogo}
        aria-label={`Fotos: ${titulo}`}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") passar(1);
          if (e.key === "ArrowLeft") passar(-1);
        }}
      >
        <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[0.95rem] font-bold" aria-live="polite">
              Foto {aberta + 1} de {fotos.length}
            </span>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X aria-hidden className="size-6" />
              <span className="sr-only">Fechar</span>
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto protegida do portal */}
            <img src={fotos[aberta]} alt={`${titulo} — foto ${aberta + 1} de ${fotos.length}`} className="max-h-full max-w-full object-contain" />
            {fotos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => passar(-1)}
                  className="absolute left-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/55 hover:bg-black/75"
                >
                  <ChevronLeft aria-hidden className="size-7" />
                  <span className="sr-only">Foto anterior</span>
                </button>
                <button
                  type="button"
                  onClick={() => passar(1)}
                  className="absolute right-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-black/55 hover:bg-black/75"
                >
                  <ChevronRight aria-hidden className="size-7" />
                  <span className="sr-only">Próxima foto</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </dialog>
    </div>
  );
}
