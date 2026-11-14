/**
 * Cartão "Classificados" para o Início do morador (componente de servidor).
 * Mostra os 3 anúncios mais novos. Se der erro, o Início continua abrindo.
 * Uso: <WidgetClassificados ctx={ctx} />
 */
import Link from "next/link";
import { ChevronRight, Plus, Store } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { anunciosPublicados, type AnuncioPublico } from "@/server/dados/classificados";
import { ROTULO_CATEGORIA } from "@/lib/classificados";
import { Cartao } from "@/components/ui/basicos";
import { ICONE_CATEGORIA, textoPreco } from "./pecas";

const QUANTOS = 3;

export async function WidgetClassificados({ ctx }: { ctx: Contexto }) {
  // Perfil sem acesso aos classificados: o cartão simplesmente não aparece.
  if (!ctx.permissoes.has("classificados.usar")) return null;

  let anuncios: AnuncioPublico[];
  try {
    anuncios = await anunciosPublicados(ctx);
  } catch (erro) {
    console.error("Início: não foi possível carregar os classificados", erro);
    return null;
  }
  const recentes = anuncios.slice(0, QUANTOS);

  return (
    <section aria-labelledby="titulo-widget-classificados">
      <Cartao className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-widget-classificados" className="text-[1.1rem] font-bold text-destaque">
            Classificados
          </h2>
          <Link href="/classificados" className="inline-flex min-h-11 shrink-0 items-center text-[0.88rem] font-bold text-pine">
            Ver todos <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>

        {recentes.length === 0 ? (
          <div className="flex items-center gap-3 text-ink-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-ok-soft text-pine">
              <Store aria-hidden className="size-6" />
            </span>
            <p>Nenhum anúncio no momento. Que tal ser o primeiro?</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentes.map((a) => {
              const Icone = ICONE_CATEGORIA[a.categoria];
              const preco = textoPreco(a.categoria, a.preco);
              return (
                <li key={a.id}>
                  <Link
                    href="/classificados"
                    className="saltado flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition-shadow active:shadow-afundado"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-lake-soft text-lake">
                      <Icone aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-ink">{a.titulo}</b>
                      <span className="block truncate text-[0.85rem] text-muted">
                        {ROTULO_CATEGORIA[a.categoria]} · {a.autorPrimeiroNome}
                      </span>
                    </span>
                    {preco ? <span className="shrink-0 font-bold text-destaque tabular-nums">{preco}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/classificados?aba=novo"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake"
        >
          <Plus aria-hidden className="size-4" /> Anunciar
        </Link>
      </Cartao>
    </section>
  );
}
