/**
 * MAPA DA VOTAÇÃO (comissão): a planta real do condomínio com cada casa pintada:
 * verde = já votou, cinza = falta votar, vermelho = bloqueada, tracejado = sem cadastro/inativa.
 * Mostra só QUEM votou (como a lista de participação) — nunca o voto.
 * Componente de servidor (SVG puro), usa a mesma planta do mapa do morador.
 */
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
}: {
  situacoes: Map<number, SituacaoCasaMapa>;
}) {
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
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-item">
        <svg
          viewBox={`${x} ${y} ${w} ${h}`}
          role="img"
          aria-label="Mapa das casas: quem já votou e quem falta"
          className="block h-auto w-full"
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
              <title>{`Casa ${l.numero} — ${ROTULO[l.s]}`}</title>
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
              {ROTULO[k]} <b className="text-ink tabular-nums">{conta[k]}</b>
            </span>
          ))}
      </figcaption>
    </figure>
  );
}
