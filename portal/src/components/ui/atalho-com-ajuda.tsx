"use client";

/**
 * Atalho do painel com um botão "i" no canto: abre uma janelinha que explica,
 * em linguagem simples, para que serve aquela parte do portal.
 * O "i" fica FORA do link (nada de botão dentro de link).
 */
import { useId, useRef } from "react";
import Link from "next/link";
import { Info, X } from "lucide-react";
import { AtalhoModulo, type TomModulo } from "@/components/ui/painel";
import {
  ICONES_ATALHO,
  type NomeIconeAtalho,
} from "@/components/ui/icones-atalho";

export function AtalhoComAjuda({
  icone,
  titulo,
  href,
  tom,
  ajuda,
  rotuloAbrir,
}: {
  icone: NomeIconeAtalho;
  titulo: string;
  href: string;
  tom: TomModulo;
  ajuda: string;
  /** Texto do botão da janela (padrão: "Abrir <título>"). */
  rotuloAbrir?: string;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const Icone = ICONES_ATALHO[icone];
  return (
    <div className="relative h-full">
      <AtalhoModulo icone={Icone} titulo={titulo} href={href} tom={tom} />
      <button
        type="button"
        onClick={() => janela.current?.showModal()}
        aria-label={`O que é “${titulo}”?`}
        className="absolute right-0.5 top-0.5 grid size-8 place-items-center rounded-full text-muted hover:text-destaque focus-visible:outline-3 focus-visible:outline-lake"
      >
        <Info aria-hidden className="size-4" />
      </button>
      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        onClick={(e) => {
          if (e.target === janela.current) janela.current?.close();
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-surface-item text-destaque">
              <Icone aria-hidden className="size-6" />
            </span>
            <h2
              id={idTitulo}
              className="min-w-0 flex-1 pt-1.5 text-xl font-bold leading-tight"
            >
              {titulo}
            </h2>
            <button
              type="button"
              onClick={() => janela.current?.close()}
              aria-label="Fechar"
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:shadow-afundado"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <p className="text-[1rem] leading-relaxed text-ink-2">{ajuda}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => janela.current?.close()}
              className="min-h-12 rounded-full px-5 font-bold text-ink-2 hover:shadow-afundado"
            >
              Entendi
            </button>
            <Link
              href={href}
              className="grid min-h-12 place-items-center rounded-full bg-pine px-6 font-bold text-canvas shadow-relevo active:shadow-afundado"
            >
              {rotuloAbrir ?? `Abrir ${titulo}`}
            </Link>
          </div>
        </div>
      </dialog>
    </div>
  );
}
