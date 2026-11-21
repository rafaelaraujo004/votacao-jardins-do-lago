/**
 * MAPA DA VOTAÇÃO (comissão): a planta real do condomínio com cada casa pintada:
 * verde = já votou, cinza = falta votar (depois do encerramento, "sem votar"),
 * vermelho = bloqueada, tracejado = sem cadastro/inativa.
 * Mostra só QUEM votou (como a lista de participação) — nunca o voto.
 * Componente de servidor (SVG puro), usa a mesma planta do mapa do morador.
 * No celular os números ficariam pequenos demais: em tela estreita o mapa ganha largura
 * mínima e rola de lado dentro da própria caixa (a página não rola de lado).
 */
import { MoveHorizontal } from "lucide-react";
import type { SituacaoEleicao } from "@/lib/eleicoes";
import { AREA_DESENHO, CONTORNO_TERRENO, QUADRAS } from "@/lib/planta";

export type SituacaoCasaMapa = "votou" | "falta" | "bloqueada" | "inativa";

const COR: Record<SituacaoCasaMapa | "semCadastro", string> = {
  votou: "var(--pine)",
  falta: "var(--surface-item)",
  bloqueada: "var(--danger)",
  inativa: "var(--line)",
  semCadastro: "transparent",
};
const TEXTO: Record<SituacaoCasaMapa | "semCadastro", string> = {
  votou: "var(--canvas)",
  falta: "var(--ink)",
  bloqueada: "#ffffff",
  inativa: "var(--muted)",
  semCadastro: "var(--muted)",
};
const ROTULO: Record<SituacaoCasaMapa | "semCadastro", string> = {
  votou: "Já votou",
  falta: "Falta votar",
  bloqueada: "Bloqueada",
  inativa: "Inativa",
  semCadastro: "Sem cadastro",
};

const pontos = (p: [number, number][]) =>
  p.map(([x, y]) => `${x},${y}`).join(" ");

export function MapaVotacao({
  situacoes,
  situacao,
}: {
  situacoes: Map<number, SituacaoCasaMapa>;
  /** Situação da eleição: depois do encerramento, "Falta votar" vira "Sem votar". */
  situacao?: SituacaoEleicao;
}) {
  const encerrada = situacao === "encerrada";
  const rotulo = (s: SituacaoCasaMapa | "semCadastro") =>
    s === "falta" && encerrada ? "Sem votar" : ROTULO[s];
  const conta = {
    votou: 0,
    falta: 0,
    bloqueada: 0,
    inativa: 0,
    semCadastro: 0,
  };
  const lotes = QUADRAS.flatMap((q) => q.lotes).map((l) => {
    const s: SituacaoCasaMapa | "semCadastro" =
      situacoes.get(l.numero) ?? "semCadastro";
    conta[s]++;
    return { ...l, s };
  });
  const { x, y, w, h } = AREA_DESENHO;
  return (
    <figure className="flex flex-col gap-3">
      {/* Só em tela estreita, onde o mapa fica mais largo que a tela. */}
      <p className="flex items-center gap-1.5 text-[0.85rem] text-muted md:hidden">
        <MoveHorizontal aria-hidden className="size-4 shrink-0" /> Arraste para o lado para ver o mapa inteiro.
      </p>
      <div
        role="region"
        aria-label="Mapa das casas (rola para o lado)"
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain rounded-2xl border border-line bg-surface-item focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-lake"
      >
        <svg
          viewBox={`${x} ${y} ${w} ${h}`}
          role="img"
          aria-label={
            encerrada
              ? "Mapa das casas: quem votou e quem não votou"
              : "Mapa das casas: quem já votou e quem falta"
          }
          className="block h-auto w-full max-md:min-w-[720px]"
        >
          <polygon
            points={pontos(CONTORNO_TERRENO)}
            fill="var(--surface)"
            stroke="var(--line)"
            strokeWidth={2}
          />
          {QUADRAS.map((q) => (
            <polygon
              key={q.id}
              points={pontos(q.contorno)}
              fill="none"
              stroke="var(--line)"
              strokeWidth={1.5}
            />
          ))}
          {lotes.map((l) => (
            <g key={l.numero}>
              <title>{`Casa ${l.numero} — ${rotulo(l.s)}`}</title>
              <rect
                x={l.x + 1}
                y={l.y + 1}
                width={Math.max(1, l.w - 2)}
                height={Math.max(1, l.h - 2)}
                rx={3}
                fill={COR[l.s]}
                stroke={l.s === "semCadastro" ? "var(--muted)" : "var(--line)"}
                strokeDasharray={l.s === "semCadastro" ? "4 3" : undefined}
                strokeWidth={1}
              />
              <text
                x={l.x + l.w / 2}
                y={l.y + l.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.min(13, Math.max(8, Math.min(l.w, l.h) * 0.42))}
                fontWeight={700}
                fill={TEXTO[l.s]}
              >
                {l.numero}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.88rem] text-ink-2">
        {(["votou", "falta", "bloqueada", "inativa", "semCadastro"] as const)
          .filter((k) => k === "votou" || k === "falta" || conta[k] > 0)
          .map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-3.5 rounded-[4px] border border-line"
                style={{
                  background: COR[k],
                  borderStyle: k === "semCadastro" ? "dashed" : "solid",
                }}
              />
              {rotulo(k)} <b className="text-ink tabular-nums">{conta[k]}</b>
            </span>
          ))}
      </figcaption>
    </figure>
  );
}
