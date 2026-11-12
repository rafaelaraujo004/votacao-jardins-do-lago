"use client";

/**
 * Confirmação antes de ações importantes.
 * Abre uma janela com o que vai acontecer e dois botões claros.
 */
import { useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Botao } from "./botao";

export function BotaoComConfirmacao({
  children,
  titulo,
  mensagem,
  textoConfirmar,
  perigo = false,
  aoConfirmar,
  variante = "secundario",
}: {
  children: ReactNode;
  titulo: string;
  mensagem: ReactNode;
  textoConfirmar: string;
  perigo?: boolean;
  aoConfirmar: () => Promise<void> | void;
  variante?: "primario" | "secundario" | "perigo";
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const [carregando, setCarregando] = useState(false);

  async function confirmar() {
    setCarregando(true);
    try {
      await aoConfirmar();
      janela.current?.close();
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <Botao variante={variante} onClick={() => janela.current?.showModal()}>
        {children}
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby="confirmacao-titulo"
        className="m-auto w-[min(92vw,28rem)] rounded-3xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          {perigo ? (
            <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
              <TriangleAlert aria-hidden className="size-6" />
            </span>
          ) : null}
          <h2 id="confirmacao-titulo" className="text-xl font-bold">
            {titulo}
          </h2>
          <div className="text-ink-2">{mensagem}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao variante="secundario" onClick={() => janela.current?.close()} disabled={carregando}>
              Voltar
            </Botao>
            <Botao variante={perigo ? "perigo" : "primario"} onClick={confirmar} carregando={carregando}>
              {textoConfirmar}
            </Botao>
          </div>
        </div>
      </dialog>
    </>
  );
}
