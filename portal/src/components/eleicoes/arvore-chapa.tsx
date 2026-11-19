/**
 * ÁRVORE DA CHAPA (animada, tipo ramificação): o 1º integrante (síndico) no topo;
 * os galhos crescem e aparecem os próximos (vice e tesoureira), depois o tronco
 * continua e aparecem os demais (fiscais). Com foto de cada um (ou as iniciais).
 * Só CSS (funciona em tela de servidor e de navegador); quem pediu menos movimento
 * no aparelho vê tudo parado.
 */
import type { CSSProperties } from "react";
import type { Candidato } from "@/lib/eleicoes";
import { cx } from "@/lib/cx";

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("pt-BR"))
    .join("");

function Pessoa({
  c,
  foto,
  grande = false,
  atraso,
}: {
  c: Candidato;
  foto?: string;
  grande?: boolean;
  atraso: number;
}) {
  return (
    <div
      className="arvore-surge flex min-w-0 flex-col items-center gap-1.5 text-center"
      style={{ "--atraso": `${atraso}ms` } as CSSProperties}
    >
      <span
        className={cx(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-item font-display font-extrabold text-destaque ring-4 ring-surface shadow-relevo",
          grande ? "size-24 text-[1.6rem]" : "size-[72px] text-[1.2rem]",
        )}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pequena em data URL (não passa pelo otimizador)
          <img src={foto} alt="" className="size-full object-cover" />
        ) : (
          <span aria-hidden>{iniciais(c.nome)}</span>
        )}
      </span>
      <span className="max-w-full break-words text-[0.95rem] font-bold leading-tight text-ink">
        {c.nome}
      </span>
      {c.funcao ? (
        <span className="rounded-full bg-ok-soft px-2 py-px text-[0.72rem] font-bold uppercase tracking-wide text-pine">
          {c.funcao}
        </span>
      ) : null}
    </div>
  );
}

/** Ligação de um nível para o de baixo: tronco no meio + barra + galhos até cada pessoa. */
function Galhos({
  quantos,
  atraso,
  tronco = true,
}: {
  quantos: number;
  atraso: number;
  tronco?: boolean;
}) {
  const centros = Array.from(
    { length: quantos },
    (_, i) => ((i + 0.5) / quantos) * 100,
  );
  const esq = centros[0];
  const dir = centros[centros.length - 1];
  return (
    <div aria-hidden className="relative h-9 w-full">
      {tronco ? (
        <span
          className="arvore-cresce-y absolute left-1/2 top-0 h-1/2 w-[3px] -translate-x-1/2 rounded-full bg-pine/60"
          style={{ "--atraso": `${atraso}ms` } as CSSProperties}
        />
      ) : null}
      {quantos > 1 ? (
        <span
          className="arvore-cresce-x absolute top-1/2 h-[3px] rounded-full bg-pine/60"
          style={
            {
              left: `${esq}%`,
              width: `${dir - esq}%`,
              "--atraso": `${atraso + 180}ms`,
            } as CSSProperties
          }
        />
      ) : null}
      {centros.map((x) => (
        <span
          key={x}
          className="arvore-cresce-y absolute top-1/2 h-1/2 w-[3px] -translate-x-1/2 rounded-full bg-pine/60"
          style={
            { left: `${x}%`, "--atraso": `${atraso + 320}ms` } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Divide a chapa em níveis: 1 no topo, até 2 no segundo, o resto em linhas de até 3. */
function niveis(candidatos: Candidato[]): Candidato[][] {
  const [topo, ...resto] = candidatos;
  if (!topo) return [];
  const linhas: Candidato[][] = [[topo]];
  if (resto.length) linhas.push(resto.slice(0, 2));
  for (let i = 2; i < resto.length; i += 3) linhas.push(resto.slice(i, i + 3));
  return linhas;
}

export function ArvoreChapa({
  candidatos,
  fotos = {},
  className,
}: {
  candidatos: Candidato[];
  fotos?: Record<string, string>;
  className?: string;
}) {
  const linhas = niveis([...candidatos].sort((a, b) => a.numero - b.numero));
  return (
    <figure
      className={cx("flex flex-col items-stretch", className)}
      aria-label="Integrantes da chapa"
    >
      {linhas.map((linha, i) => {
        // Cada nível aparece 0,9 s depois do anterior (galhos antes das pessoas).
        const pessoasAtraso = i * 900;
        const bloco = (
          <div key={linha[0].id} className="flex flex-col">
            {i > 0 ? (
              <Galhos quantos={linha.length} atraso={pessoasAtraso - 520} />
            ) : null}
            <div
              className="relative grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${linha.length}, minmax(0, 1fr))`,
              }}
            >
              {/* O tronco continua entre as pessoas até o próximo nível. */}
              {i > 0 && i < linhas.length - 1 ? (
                <span
                  aria-hidden
                  className="arvore-cresce-y absolute bottom-0 left-1/2 top-0 w-[3px] -translate-x-1/2 rounded-full bg-pine/60"
                  style={
                    { "--atraso": `${pessoasAtraso + 300}ms` } as CSSProperties
                  }
                />
              ) : null}
              {linha.map((c) => (
                <Pessoa
                  key={c.id}
                  c={c}
                  foto={fotos[c.id]}
                  grande={i === 0}
                  atraso={pessoasAtraso}
                />
              ))}
            </div>
          </div>
        );
        return bloco;
      })}
      <figcaption className="sr-only">
        {candidatos
          .map((c) => `${c.nome}${c.funcao ? `, ${c.funcao}` : ""}`)
          .join("; ")}
      </figcaption>
    </figure>
  );
}
