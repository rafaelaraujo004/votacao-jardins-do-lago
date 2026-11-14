"use client";

/**
 * Avisos rápidos (toasts): o retorno visual depois de cada operação.
 * Uso: const { avisar } = useAvisos(); avisar("sucesso", "Visitante autorizado.");
 * Leitores de tela anunciam o aviso automaticamente (aria-live).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";

type TipoAviso = "sucesso" | "erro" | "info" | "aviso";
type Aviso = { id: number; tipo: TipoAviso; texto: string };

const Contexto = createContext<{ avisar: (tipo: TipoAviso, texto: string) => void } | null>(null);

const visual: Record<TipoAviso, { icone: LucideIcon; classe: string }> = {
  sucesso: { icone: CircleCheck, classe: "border-transparent bg-pine text-on-pine" },
  erro: { icone: CircleAlert, classe: "border-danger text-danger" },
  info: { icone: Info, classe: "border-lake text-lake" },
  aviso: { icone: TriangleAlert, classe: "border-warn text-warn" },
};

export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximo = useRef(1);

  const fechar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const avisar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      const id = proximo.current++;
      setAvisos((lista) => [...lista.slice(-2), { id, tipo, texto }]);
      window.setTimeout(() => fechar(id), tipo === "erro" ? 8000 : 4500);
    },
    [fechar],
  );

  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {avisos.map((a) => {
          const { icone: Icone, classe } = visual[a.tipo];
          return (
            <div
              key={a.id}
              role={a.tipo === "erro" ? "alert" : "status"}
              className="surgir pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[18px] border border-borda-luz bg-surface px-4 py-3 shadow-float"
            >
              <span className={cx("grid size-9 shrink-0 place-items-center rounded-full border-2", classe)}>
                <Icone aria-hidden className="size-5" />
              </span>
              <p className="flex-1 font-bold text-ink">{a.texto}</p>
              <button
                type="button"
                onClick={() => fechar(a.id)}
                className="grid size-11 place-items-center rounded-full text-muted hover:shadow-afundado"
                aria-label="Fechar aviso"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAvisos precisa estar dentro de <ProvedorDeAvisos>.");
  return ctx;
}
