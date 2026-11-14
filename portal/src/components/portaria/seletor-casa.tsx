"use client";

/**
 * Escolher a casa digitando o número. Mostra até 8 casas parecidas para tocar.
 * A casa escolhida vai no formulário pelo campo escondido "unitId".
 */
import { useEffect, useRef, useState } from "react";
import { Check, House, RefreshCw, Search } from "lucide-react";
import { classeEntrada } from "@/components/ui/basicos";
import { filtrarCasas, type CasaParaBusca } from "@/lib/portaria";
import { cx } from "@/lib/cx";

export function SeletorCasa({ casas, id, rotulo = "Casa" }: { casas: CasaParaBusca[]; id: string; rotulo?: string }) {
  const [termo, setTermo] = useState("");
  const [escolhida, setEscolhida] = useState<CasaParaBusca | null>(null);
  const escondido = useRef<HTMLInputElement>(null);
  const resultados = termo.trim() ? filtrarCasas(casas, termo) : [];

  // Quando o formulário é limpo (depois de salvar), a escolha também volta ao começo.
  useEffect(() => {
    const form = escondido.current?.form;
    if (!form) return;
    const limpar = () => {
      setEscolhida(null);
      setTermo("");
    };
    form.addEventListener("reset", limpar);
    return () => form.removeEventListener("reset", limpar);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {rotulo}
      </label>
      <input ref={escondido} type="hidden" name="unitId" value={escolhida?.id ?? ""} />

      {escolhida ? (
        <div className="flex min-h-12 items-center gap-3 rounded-2xl border-2 border-pine bg-ok-soft px-4 py-2">
          <Check aria-hidden className="size-5 shrink-0 text-pine" />
          <span className="flex-1 text-lg font-bold text-ink">{escolhida.rotulo}</span>
          <button
            type="button"
            onClick={() => {
              setEscolhida(null);
              setTermo("");
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-lake hover:shadow-afundado"
          >
            <RefreshCw aria-hidden className="size-4" /> Trocar
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
            <input
              id={id}
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                // Enter escolhe a primeira casa da lista, em vez de enviar o formulário.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (resultados[0]) setEscolhida(resultados[0]);
                }
              }}
              placeholder="Digite o número da casa"
              autoComplete="off"
              enterKeyHint="search"
              className={cx(classeEntrada, "pl-12")}
              aria-describedby={`${id}-dica`}
            />
          </div>
          <p id={`${id}-dica`} className="text-[0.92rem] text-muted">
            {casas.length === 0
              ? "Nenhuma casa cadastrada. Peça à administração para cadastrar as unidades."
              : termo.trim() && resultados.length === 0
                ? "Nenhuma casa encontrada com esse número."
                : "Toque na casa certa na lista."}
          </p>
          {resultados.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Casas encontradas">
              {resultados.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setEscolhida(c)}
                    className="saltado flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-3 font-bold text-ink active:shadow-afundado"
                  >
                    <House aria-hidden className="size-4 text-pine" />
                    {c.rotulo}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
