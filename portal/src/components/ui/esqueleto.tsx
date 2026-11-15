/**
 * Esqueleto de tela: aparece no mesmo instante do toque, enquanto o servidor
 * prepara a próxima página. Assim o portal nunca parece "travado".
 */
import { cx } from "@/lib/cx";

function Bloco({ className }: { className?: string }) {
  return <div aria-hidden className={cx("esqueleto", className)} />;
}

export function EsqueletoTela({ cartoes = 3 }: { cartoes?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-2">
        <Bloco className="h-8 w-56 max-w-[70%]" />
        <Bloco className="h-4 w-80 max-w-[90%]" />
      </div>
      {Array.from({ length: cartoes }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-borda-luz bg-surface p-5 shadow-card"
        >
          <Bloco className="h-5 w-40" />
          <Bloco className="h-4 w-full" />
          <Bloco className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
