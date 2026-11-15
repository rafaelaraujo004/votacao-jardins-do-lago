/**
 * Peças das reservas: etiqueta de situação (ícone + texto, nunca só cor),
 * cores dos pontinhos do calendário, legenda, horários de uso livre e avisos.
 */
import { AlarmClockOff, Ban, CalendarCheck, CircleDashed, CircleSlash, CircleX, Clock, Sun, type LucideIcon } from "lucide-react";
import { Alerta, Etiqueta } from "@/components/ui/basicos";
import {
  ROTULO_CANCELADA_TARDE,
  ROTULO_STATUS,
  ROTULO_USO_LIVRE,
  horaCurta,
  type EstadoFaixa,
  type FaixaLivre,
  type StatusReserva,
} from "@/lib/reservas";
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

/** Etiqueta do síndico: o morador desistiu faltando menos que o prazo de desistência. */
export function EtiquetaCanceladaTarde() {
  return (
    <Etiqueta tom="erro" icone={AlarmClockOff}>
      {ROTULO_CANCELADA_TARDE}
    </Etiqueta>
  );
}

/** Horários de uso livre da área (só informação: não são reserváveis). */
export function ListaUsoLivre({ faixas }: { faixas: FaixaLivre[] }) {
  if (!faixas.length) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Horários de uso livre">
      {faixas.map((f) => (
        <li
          key={`${f.inicio}-${f.fim}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-line px-3 py-2"
        >
          <span>
            <b>{f.rotulo}</b>{" "}
            <span className="text-[0.88rem] text-muted">
              {horaCurta(f.inicio)} às {horaCurta(f.fim)}
            </span>
          </span>
          <Etiqueta tom="ok" icone={Sun}>
            {ROTULO_USO_LIVRE}
          </Etiqueta>
        </li>
      ))}
    </ul>
  );
}

/** Avisos da área em destaque (ex.: "Combustível por conta de quem reserva"). */
export function AvisosDaArea({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <Alerta tipo="aviso" titulo={avisos.length === 1 ? "Aviso" : "Avisos"}>
      {avisos.length === 1 ? (
        <p>{avisos[0]}</p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </Alerta>
  );
}
