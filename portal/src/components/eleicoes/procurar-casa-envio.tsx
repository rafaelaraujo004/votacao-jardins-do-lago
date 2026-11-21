"use client";

/**
 * Página de links de voto: campo "Procurar casa" acima da lista de envio.
 * Filtra NA HORA (no próprio aparelho, sem recarregar) pelo número/rótulo da casa, junto com
 * o filtro escolhido em cima (Faltam votar, Não enviados…). Mesmo jeito do "Procurar casa"
 * do bloqueio de casas.
 *
 * Os cartões chegam prontos do servidor; aqui só ESCONDEMOS os que não batem com a busca
 * (sem desmontar): assim cada cartão guarda o que já foi feito nele, como o "próximo contato"
 * do botão do WhatsApp, enquanto a comissão procura outra casa.
 * O texto da busca continua ao trocar de filtro (a página não perde este componente).
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { classeEntrada } from "@/components/ui/basicos";
import { cx } from "@/lib/cx";

export type CartaoDeCasa = {
  /** Identificador da casa (chave da lista). */
  id: string;
  /** Rótulo da casa, ex.: "Casa 137" — é por ele que a busca procura. */
  rotulo: string;
  /** O cartão já montado no servidor. */
  cartao: ReactNode;
};

export function ProcurarCasaEnvio({
  itens,
  vazio,
  hrefTodas,
}: {
  itens: CartaoDeCasa[];
  /** O que mostrar quando o filtro escolhido não tem nenhuma casa. */
  vazio: ReactNode;
  /** Link do filtro "Todas" (quando o filtro atual é outro): a casa pode estar lá. */
  hrefTodas?: string;
}) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR");

  const aparece = useMemo(() => {
    if (!termo) return null; // sem busca: todas aparecem
    return new Set(
      itens
        .filter((i) => i.rotulo.toLocaleLowerCase("pt-BR").includes(termo))
        .map((i) => i.id),
    );
  }, [itens, termo]);
  const quantas = aparece ? aparece.size : itens.length;

  return (
    <div className="flex flex-col gap-2.5">
      <label className="relative">
        <span className="sr-only">Procurar casa</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={busca}
          inputMode="search"
          autoComplete="off"
          onKeyDown={(e) => {
            // No celular, o "Ir" do teclado só fecha o teclado (a lista já filtrou).
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar casa (ex.: 137)"
          className={cx(classeEntrada, "pl-9")}
        />
      </label>

      {termo && itens.length > 0 ? (
        <p className="text-[0.88rem] text-muted" aria-live="polite">
          {quantas === 1
            ? "1 casa encontrada neste filtro."
            : `${quantas} casas encontradas neste filtro.`}
        </p>
      ) : null}

      {itens.length === 0 ? (
        vazio
      ) : (
        <>
          {quantas === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-4">
              <p className="font-bold text-ink">
                Nenhuma casa com “{busca.trim()}” neste filtro.
              </p>
              <div className="flex flex-wrap gap-2">
                {hrefTodas ? (
                  <Link
                    href={hrefTodas}
                    scroll={false}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-lake hover:shadow-afundado"
                  >
                    <Search aria-hidden className="size-4" /> Procurar em “Todas”
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-lake hover:shadow-afundado"
                >
                  <X aria-hidden className="size-4" /> Limpar a busca
                </button>
              </div>
            </div>
          ) : null}
          <ul className="flex flex-col gap-2.5">
            {itens.map((i) => (
              <li key={i.id} hidden={aparece ? !aparece.has(i.id) : false}>
                {i.cartao}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
