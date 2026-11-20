"use client";

/**
 * Confirmação antes de ações importantes.
 * Abre uma janela com o que vai acontecer e dois botões claros.
 * Se a ação nem chegar ao servidor (internet caiu, ou o site foi atualizado com a
 * página aberta), a janela avisa e oferece "Atualizar a página" — nunca fica muda.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
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
  // Id único por janela: com várias na mesma página, cada uma é anunciada com o próprio título.
  const idTitulo = useId();
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  async function confirmar() {
    setCarregando(true);
    setFalhou(false);
    try {
      await aoConfirmar();
      janela.current?.close();
    } catch (erro) {
      // A ação não respondeu (sem internet ou versão nova do site): avisa em vez de ficar parada.
      console.error("Confirmação: a ação não foi concluída", erro);
      setFalhou(true);
    } finally {
      setCarregando(false);
    }
  }

  function abrir() {
    setFalhou(false);
    janela.current?.showModal();
  }

  return (
    <>
      <Botao variante={variante} onClick={abrir}>
        {children}
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        className="m-auto w-[min(92vw,28rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          {perigo ? (
            <span className="grid size-12 place-items-center rounded-[14px] bg-danger-soft text-danger">
              <TriangleAlert aria-hidden className="size-6" />
            </span>
          ) : null}
          <h2 id={idTitulo} className="text-xl font-bold">
            {titulo}
          </h2>
          <div className="text-ink-2">{mensagem}</div>
          {falhou ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4 text-danger"
            >
              <p className="font-bold">
                Não deu para confirmar se foi concluído.
              </p>
              <p className="text-ink-2">
                Confira a internet e atualize a página para ver como ficou. Se
                ainda não mudou, faça de novo.
              </p>
              <Botao
                variante="secundario"
                onClick={() => window.location.reload()}
              >
                <RotateCw aria-hidden className="size-4" /> Atualizar a página
              </Botao>
            </div>
          ) : null}
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
