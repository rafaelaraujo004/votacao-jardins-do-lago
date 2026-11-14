/**
 * Aviso para o painel do síndico (/admin): quantos anúncios aguardam aprovação.
 * Componente de servidor. Uso: <ResumoClassificados ctx={ctx} />
 * Não aparece para quem não modera; se der erro, o painel continua abrindo.
 */
import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { numerosClassificados } from "@/server/dados/classificados";
import { cx } from "@/lib/cx";

export async function ResumoClassificados({ ctx }: { ctx: Contexto }) {
  if (!ctx.permissoes.has("classificados.moderar")) return null;

  let numeros: { pendentes: number; publicados: number };
  try {
    numeros = await numerosClassificados(ctx);
  } catch (erro) {
    console.error("Painel: não foi possível carregar os classificados", erro);
    return null;
  }
  const { pendentes, publicados } = numeros;

  return (
    <Link
      href="/admin/classificados"
      className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card transition-shadow active:shadow-afundado"
    >
      <span
        className={cx(
          "grid size-[46px] shrink-0 place-items-center rounded-[14px]",
          pendentes ? "bg-warn-soft text-warn" : "bg-ok-soft text-pine",
        )}
      >
        <Store aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-ink">Classificados</b>
        <span className="block text-[0.9rem] text-ink-2">
          {pendentes === 0
            ? "Nenhum anúncio aguardando aprovação"
            : pendentes === 1
              ? "1 anúncio aguardando aprovação"
              : `${pendentes} anúncios aguardando aprovação`}
          {` · ${publicados} no ar`}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}
