/**
 * Peças visuais da portaria que não precisam de JavaScript no navegador:
 * etiquetas de situação, escolha em pílulas e a hora no fuso do condomínio.
 */
import type { ReactNode } from "react";
import { Ban, CalendarClock, CircleCheck, Clock, PackageCheck, PackageOpen, TimerOff } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { formatarDataHora } from "@/lib/formato";
import type { SituacaoVisita } from "@/lib/portaria";

/** "14:35" no fuso do condomínio. */
export function horaDe(data: Date | null, fuso: string): string {
  return data ? (formatarDataHora(data, fuso).split(" às ")[1] ?? "") : "";
}

export function EtiquetaVisita({ situacao }: { situacao: SituacaoVisita }) {
  switch (situacao) {
    case "valida_hoje":
      return <Etiqueta tom="ok" icone={CircleCheck}>Vale hoje</Etiqueta>;
    case "agendada":
      return <Etiqueta tom="info" icone={CalendarClock}>Agendada</Etiqueta>;
    case "usada":
      return <Etiqueta tom="neutro" icone={CircleCheck}>Usada</Etiqueta>;
    case "vencida":
      return <Etiqueta tom="aviso" icone={TimerOff}>Vencida</Etiqueta>;
    case "cancelada":
      return <Etiqueta tom="erro" icone={Ban}>Cancelada</Etiqueta>;
  }
}

export function EtiquetaEncomenda({ status }: { status: "aguardando" | "entregue" }) {
  return status === "aguardando" ? (
    <Etiqueta tom="destaque" icone={PackageOpen}>Aguardando retirada</Etiqueta>
  ) : (
    <Etiqueta tom="ok" icone={PackageCheck}>Entregue</Etiqueta>
  );
}

export function EtiquetaDentro({ desde }: { desde: string }) {
  return <Etiqueta tom="info" icone={Clock}>Dentro desde {desde}</Etiqueta>;
}

/**
 * Escolha única em pílulas grandes (rádio de verdade, funciona sem JavaScript).
 * A escolhida fica "afundada" e verde; o contorno aparece ao navegar pelo teclado.
 */
export function OpcoesPilula({
  nome,
  legenda,
  opcoes,
  padrao,
}: {
  nome: string;
  legenda: string;
  opcoes: { valor: string; rotulo: ReactNode }[];
  padrao?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-bold">{legenda}</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={
              "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-borda-luz bg-surface px-4 text-center font-bold text-ink-2 shadow-relevo " +
              "has-checked:border-pine has-checked:text-destaque has-checked:shadow-afundado " +
              "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake"
            }
          >
            <input type="radio" name={nome} value={o.valor} defaultChecked={o.valor === padrao} required className="sr-only" />
            {o.rotulo}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
