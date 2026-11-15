"use client";

/**
 * Botão que abre uma janela com um pequeno formulário ligado a uma Server Action
 * (ex.: recusar com motivo, reservar para uma casa, bloquear horário).
 * Ao salvar: fecha a janela e atualiza a página.
 */
import { useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario, type ResultadoAcao } from "@/components/ui/formulario";

export function DialogoFormulario({
  acao,
  campos,
  rotuloBotao,
  icone,
  titulo,
  descricao,
  children,
  textoEnviar,
  textoEnviando = "Salvando…",
  varianteBotao = "secundario",
  varianteEnviar = "primario",
}: {
  acao: (anterior: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;
  /** Campos escondidos enviados junto (ex.: id da reserva). */
  campos: Record<string, string>;
  rotuloBotao: string;
  icone?: ReactNode;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
  textoEnviar: string;
  textoEnviando?: string;
  varianteBotao?: "primario" | "secundario" | "perigo";
  varianteEnviar?: "primario" | "secundario" | "perigo";
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const idTitulo = useId();

  return (
    <>
      <Botao variante={varianteBotao} tamanho="pequeno" icone={icone} onClick={() => janela.current?.showModal()}>
        {rotuloBotao}
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        className="m-auto w-[min(92vw,30rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id={idTitulo} className="text-xl font-bold">
            {titulo}
          </h2>
          {descricao ? <div className="text-ink-2">{descricao}</div> : null}
          <Formulario
            acao={acao}
            aoSalvar={() => {
              janela.current?.close();
              router.refresh();
            }}
          >
            {Object.entries(campos).map(([nome, valor]) => (
              <input key={nome} type="hidden" name={nome} value={valor} />
            ))}
            {children}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao variante="secundario" onClick={() => janela.current?.close()}>
                Voltar
              </Botao>
              <BotaoEnviar variante={varianteEnviar} textoEnviando={textoEnviando}>
                {textoEnviar}
              </BotaoEnviar>
            </div>
          </Formulario>
        </div>
      </dialog>
    </>
  );
}
