"use client";

/**
 * Menu sanduíche do celular (gestão): um botão redondo ao lado do topo que
 * abre uma gaveta lateral com as opções. Usa <dialog> nativo, então o foco
 * fica preso na gaveta, Esc fecha e o leitor de tela entende que é um menu.
 * Fecha sozinha ao tocar no fundo, no X ou em qualquer link.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cx } from "@/lib/cx";

export function GavetaMenu({
  titulo,
  className,
  children,
}: {
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const caminho = usePathname();

  // Mudou de tela: fecha a gaveta.
  useEffect(() => {
    dialogo.current?.close();
  }, [caminho]);

  // Sem rolar a página de fundo enquanto a gaveta está aberta.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const aoFechar = () => document.documentElement.classList.remove("overflow-hidden");
    d.addEventListener("close", aoFechar);
    return () => d.removeEventListener("close", aoFechar);
  }, []);

  function abrir() {
    document.documentElement.classList.add("overflow-hidden");
    dialogo.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        title="Abrir menu"
        className={cx("grid size-11 shrink-0 place-items-center rounded-full", className)}
      >
        <Menu aria-hidden className="size-6" />
        <span className="sr-only">Abrir menu</span>
      </button>

      <dialog
        ref={dialogo}
        aria-label={titulo}
        className="gaveta m-0 ml-auto h-dvh max-h-none w-[min(86vw,340px)] max-w-none bg-band p-0 text-band-fg shadow-[-12px_0_32px_rgb(0_0_0/0.35)]"
        onClick={(e) => {
          // Toque no fundo escurecido (fora da gaveta) ou em um link: fecha.
          const alvo = e.target as HTMLElement;
          if (alvo === e.currentTarget || alvo.closest("a")) e.currentTarget.close();
        }}
      >
        <div className="flex h-full flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-band px-4 py-3">
            <span className="font-display text-[1.1rem] font-bold">{titulo}</span>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              title="Fechar menu"
              className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 hover:bg-white/20"
            >
              <X aria-hidden className="size-6" />
              <span className="sr-only">Fechar menu</span>
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-2 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
