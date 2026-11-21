"use client";

/**
 * Comissão: marcar as casas que NÃO podem votar nesta eleição.
 * A lista marcada substitui a anterior ao salvar. O servidor confere tudo
 * (permissão, eleição ainda não aberta, casas existentes).
 * O prazo aparece no alto: dá para bloquear só até a abertura; aberta, a lista fica
 * congelada até o encerramento.
 */
import { useMemo, useState } from "react";
import { Ban, CircleCheck, Clock3, Search } from "lucide-react";
import { classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarBloqueiosEleicao } from "@/server/acoes/eleicoes";
import type { CasaDaEleicao } from "@/server/dados/eleicoes";
import { cx } from "@/lib/cx";

export function BloqueioCasas({
  eleicaoId,
  casas,
  abreEm,
}: {
  eleicaoId: string;
  casas: CasaDaEleicao[];
  /** Data e hora da abertura, já escrita no fuso do condomínio ("29/11/2026 às 09:00"): o prazo do bloqueio. */
  abreEm?: string;
}) {
  const algumaVotou = casas.some((c) => c.votou);
  const iniciais = useMemo(
    () => new Set(casas.filter((c) => c.bloqueada).map((c) => c.id)),
    [casas],
  );
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(casas.filter((c) => c.bloqueada).map((c) => c.id)),
  );
  const [busca, setBusca] = useState("");
  const [soBloqueadas, setSoBloqueadas] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return casas.filter(
      (c) =>
        (!termo || c.rotulo.toLocaleLowerCase("pt-BR").includes(termo)) &&
        (!soBloqueadas || marcadas.has(c.id)),
    );
  }, [casas, busca, soBloqueadas, marcadas]);

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  return (
    <Formulario acao={salvarBloqueiosEleicao} limparAoSalvar={false}>
      <input type="hidden" name="id" value={eleicaoId} />
      {[...marcadas]
        .filter((id) => !iniciais.has(id))
        .map((id) => (
          <input key={`a-${id}`} type="hidden" name="adicionar" value={id} />
        ))}
      {[...iniciais]
        .filter((id) => !marcadas.has(id))
        .map((id) => (
          <input key={`r-${id}`} type="hidden" name="remover" value={id} />
        ))}

      <p className="text-[0.92rem] text-ink-2">
        Marque as casas que <b>não podem votar</b> nesta eleição. A casa
        bloqueada vê o aviso “não liberada” no lugar da cédula.
        {/* Antes de abrir ninguém votou: a explicação do ✓ só aparece se alguma casa já votou. */}
        {algumaVotou
          ? " O ✓ verde marca quem já votou — essa casa não pode mais ser bloqueada (o voto é secreto e não pode ser retirado)."
          : null}
      </p>

      {abreEm ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 p-3 text-[0.92rem] text-ink-2">
          <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink" />
          <span>
            <b className="text-ink">Bloqueie até {abreEm}.</b> Quando a votação
            abrir, a lista fica congelada até o encerramento.
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Procurar casa</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={busca}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar casa (ex.: 140)"
            className={cx(classeEntrada, "pl-9")}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[0.92rem] font-bold">
          <input
            type="checkbox"
            checked={soBloqueadas}
            onChange={(e) => setSoBloqueadas(e.target.checked)}
            className="size-5 accent-pine"
          />
          Só as bloqueadas
        </label>
      </div>

      <p className="text-[0.9rem] font-bold text-destaque" aria-live="polite">
        {marcadas.size}{" "}
        {marcadas.size === 1 ? "casa bloqueada" : "casas bloqueadas"}
      </p>

      <ul className="grid max-h-[420px] grid-cols-2 gap-1.5 overflow-y-auto rounded-2xl border border-line p-2 min-[480px]:grid-cols-3 sm:grid-cols-4">
        {visiveis.map((c) => {
          const marcada = marcadas.has(c.id);
          return (
            <li key={c.id}>
              <label
                className={cx(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-[0.9rem]",
                  marcada
                    ? "bg-danger-soft font-bold text-danger"
                    : "bg-surface-item",
                  !c.ativa && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(c.id)}
                  disabled={c.votou && !marcada}
                  className="size-5 shrink-0 accent-danger"
                />
                <span className="min-w-0 flex-1 break-words">{c.rotulo}</span>
                {marcada ? (
                  <Ban aria-label="bloqueada" className="size-4 shrink-0" />
                ) : null}
                {c.votou ? (
                  <CircleCheck
                    aria-label="já votou"
                    className="size-4 shrink-0 text-pine"
                  />
                ) : null}
                {!c.ativa ? (
                  <span className="shrink-0 text-[0.72rem] text-muted">
                    inativa
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
        {visiveis.length === 0 ? (
          <li className="col-span-full p-3 text-center text-muted">
            Nenhuma casa encontrada.
          </li>
        ) : null}
      </ul>

      <div>
        <BotaoEnviar>Salvar bloqueios</BotaoEnviar>
      </div>
    </Formulario>
  );
}
