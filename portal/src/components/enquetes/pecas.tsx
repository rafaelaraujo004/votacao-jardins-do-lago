/**
 * Peças das enquetes: etiqueta de situação (ícone + texto, nunca só cor)
 * e as barras do resultado.
 */
import { CalendarClock, CircleCheck, Lock, PencilLine, Trophy, Vote, type LucideIcon } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { ROTULO_SITUACAO, calcularResultado, vencedoras, type OpcaoEnquete, type SituacaoEnquete } from "@/lib/enquetes";
import { cx } from "@/lib/cx";

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

const ESTILO: Record<SituacaoEnquete, { tom: Tom; icone: LucideIcon }> = {
  rascunho: { tom: "aviso", icone: PencilLine },
  agendada: { tom: "info", icone: CalendarClock },
  aberta: { tom: "ok", icone: Vote },
  encerrada: { tom: "neutro", icone: Lock },
};

export function EtiquetaEnquete({ situacao }: { situacao: SituacaoEnquete }) {
  const { tom, icone } = ESTILO[situacao];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {ROTULO_SITUACAO[situacao]}
    </Etiqueta>
  );
}

/** Etiqueta "Sua casa votou". */
export function EtiquetaVotou() {
  return (
    <Etiqueta tom="destaque" icone={CircleCheck}>
      Sua casa votou
    </Etiqueta>
  );
}

/**
 * Barras com votos e porcentagem de cada opção.
 * `encerrada`: destaca a opção mais votada (com ícone, não só cor).
 * `minhaOpcaoId`: marca a opção em que a própria casa votou (só na tela do morador).
 */
export function BarrasResultado({
  opcoes,
  totais,
  encerrada,
  minhaOpcaoId,
}: {
  opcoes: OpcaoEnquete[];
  totais: Record<string, number>;
  encerrada: boolean;
  minhaOpcaoId?: string | null;
}) {
  const { linhas, total } = calcularResultado(opcoes, totais);
  const venceu = encerrada ? new Set(vencedoras(linhas)) : new Set<string>();
  const empate = venceu.size > 1;
  return (
    <ul className="flex flex-col gap-3" aria-label="Resultado">
      {linhas.map((l) => {
        const destaque = venceu.has(l.id);
        return (
          <li key={l.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cx("min-w-0 break-words", destaque ? "font-bold text-destaque" : "text-ink")}>
                {destaque ? <Trophy aria-hidden className="mr-1.5 inline size-4 align-[-2px] text-texto-laranja" /> : null}
                {l.texto}
                {destaque ? <span className="sr-only">{empate ? " (empatada em primeiro)" : " (mais votada)"}</span> : null}
                {minhaOpcaoId === l.id ? (
                  <span className="ml-1.5 whitespace-nowrap rounded-full bg-plum-soft px-2 py-px text-[0.72rem] font-bold text-plum">
                    voto da sua casa
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[0.92rem] tabular-nums text-ink-2">
                <b className="text-ink">{l.porcentagem}%</b> · {l.votos} {l.votos === 1 ? "voto" : "votos"}
              </span>
            </div>
            <div className="afundado h-3.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className={cx("h-full rounded-full", destaque ? "bg-pine" : "bg-lake")}
                style={{ width: `${total ? Math.max(l.porcentagem, l.votos ? 2 : 0) : 0}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
