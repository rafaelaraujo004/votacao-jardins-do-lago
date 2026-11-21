"use client";

/**
 * Seção Encomendas da portaria em duas abas no celular: "Registrar" e "Aguardando (N)".
 * Em telas largas (xl), as duas partes ficam lado a lado, sem abas.
 * As duas partes ficam montadas (só escondidas): o que foi digitado não se perde ao trocar.
 */
import { useState, type ReactNode } from "react";
import { DoorOpen, PackagePlus } from "lucide-react";
import { cx } from "@/lib/cx";

type Aba = "registrar" | "aguardando";

export function AbasEncomendas({
  registrar,
  aguardando,
  total,
  semAviso,
}: {
  registrar: ReactNode;
  aguardando: ReactNode;
  total: number;
  semAviso: number;
}) {
  const [aba, setAba] = useState<Aba>("registrar");
  const opcoes: { id: Aba; rotulo: string; icone: typeof DoorOpen }[] = [
    { id: "registrar", rotulo: "Registrar", icone: PackagePlus },
    { id: "aguardando", rotulo: "Aguardando", icone: DoorOpen },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Encomendas" className="afundado grid grid-cols-2 gap-1 rounded-full p-1 xl:hidden">
        {opcoes.map((o) => {
          const Icone = o.icone;
          const ativa = aba === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              aria-controls={`aba-${o.id}`}
              onClick={() => setAba(o.id)}
              className={cx(
                "relative inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[0.92rem] font-bold transition-[background-color,color,box-shadow] duration-200",
                ativa ? "bg-surface text-destaque shadow-relevo" : "text-ink-2",
              )}
            >
              <Icone aria-hidden className="size-4 shrink-0" /> {o.rotulo}
              {o.id === "aguardando" ? (
                <span className="rounded-full bg-plum-soft px-1.5 text-[0.75rem] tabular-nums text-plum">{total}</span>
              ) : null}
              {o.id === "aguardando" && semAviso > 0 ? (
                <span aria-label={`${semAviso} sem aviso`} className="absolute right-2 top-1.5 size-2 rounded-full bg-texto-laranja" />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div id="aba-registrar" role="tabpanel" className={cx("surgir flex flex-col gap-3", aba !== "registrar" && "hidden xl:flex")}>
          <h3 className="hidden items-center gap-2 text-lg font-bold xl:flex">
            <PackagePlus aria-hidden className="size-5 text-pine" /> Registrar encomenda
          </h3>
          {registrar}
        </div>
        <div id="aba-aguardando" role="tabpanel" className={cx("surgir flex flex-col gap-3", aba !== "aguardando" && "hidden xl:flex")}>
          <h3 className="hidden items-center gap-2 text-lg font-bold xl:flex">
            <DoorOpen aria-hidden className="size-5 text-pine" /> Aguardando retirada ({total})
          </h3>
          {aguardando}
        </div>
      </div>
    </div>
  );
}
