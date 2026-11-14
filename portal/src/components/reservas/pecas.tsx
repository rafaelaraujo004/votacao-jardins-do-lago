/**
 * Peças das reservas: etiqueta de situação (ícone + texto, nunca só cor),
 * cores dos pontinhos do calendário e a legenda.
 */
import { Ban, CalendarCheck, CircleDashed, CircleSlash, CircleX, Clock, type LucideIcon } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { ROTULO_STATUS, type EstadoFaixa, type StatusReserva } from "@/lib/reservas";
import { cx } from "@/lib/cx";

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

const ESTILO: Record<StatusReserva | "livre", { tom: Tom; icone: LucideIcon }> = {
  livre: { tom: "ok", icone: CircleDashed },
  pendente: { tom: "aviso", icone: Clock },
  confirmada: { tom: "info", icone: CalendarCheck },
  bloqueada: { tom: "neutro", icone: Ban },
  recusada: { tom: "erro", icone: CircleX },
  cancelada: { tom: "neutro", icone: CircleSlash },
};

export function EtiquetaReserva({ status, texto }: { status: StatusReserva | EstadoFaixa; texto?: string }) {
  const { tom, icone } = ESTILO[status];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {texto ?? ROTULO_STATUS[status]}
    </Etiqueta>
  );
}

/** Cor do pontinho no calendário da administração. */
export const COR_PONTO: Record<"pendente" | "confirmada" | "bloqueada", string> = {
  confirmada: "bg-petala-verde",
  pendente: "bg-petala-laranja",
  bloqueada: "bg-petala-azul",
};

export function Legenda({ itens }: { itens: { cor: string; texto: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[0.85rem] text-muted">
      {itens.map((l) => (
        <li key={l.texto} className="inline-flex items-center gap-1.5">
          <i aria-hidden className={cx("size-[9px] rounded-full", l.cor)} />
          {l.texto}
        </li>
      ))}
    </ul>
  );
}
