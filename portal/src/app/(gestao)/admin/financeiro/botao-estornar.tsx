"use client";

/** Estornar pede o motivo e confirma antes, porque fica registrado para sempre. */
import { useRef } from "react";
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { estornar } from "@/server/acoes/financeiro";
import { Botao } from "@/components/ui/botao";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { formatarMoeda } from "@/lib/formato";

export function BotaoEstornar({ id, descricao, valorCentavos }: { id: string; descricao: string; valorCentavos: number }) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  return (
    <>
      <Botao variante="secundario" tamanho="pequeno" onClick={() => janela.current?.showModal()} icone={<Undo2 aria-hidden className="size-4" />}>
        Estornar
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby={`estorno-${id}`}
        className="m-auto w-[min(92vw,30rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id={`estorno-${id}`} className="text-xl font-bold">Estornar este lançamento?</h2>
          <p className="text-ink-2">
            “{descricao}” — {formatarMoeda(valorCentavos)}. O lançamento não é apagado: será criado um lançamento inverso,
            com a data de hoje, e os dois ficam registrados.
          </p>
          <Formulario
            acao={estornar}
            aoSalvar={() => {
              janela.current?.close();
              router.refresh();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Campo id={`motivo-${id}`} rotulo="Motivo do estorno">
              <input id={`motivo-${id}`} name="motivo" required minLength={3} maxLength={200} placeholder="Ex.: valor digitado errado" className={classeEntrada} />
            </Campo>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao variante="secundario" onClick={() => janela.current?.close()}>Voltar</Botao>
              <BotaoEnviar variante="perigo" textoEnviando="Estornando…">Sim, estornar</BotaoEnviar>
            </div>
          </Formulario>
        </div>
      </dialog>
    </>
  );
}
