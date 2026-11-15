/**
 * Cartão "Solicitações" para o Início do morador (componente de servidor).
 * Mostra só as solicitações da PRÓPRIA casa. Se a pessoa não puder abrir
 * solicitações (ou algo falhar), o cartão some e o Início continua abrindo.
 *
 * Uso no Início: <WidgetSolicitacoes ctx={ctx} />
 */
import Link from "next/link";
import { ChevronRight, ClipboardList, ClipboardPlus } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { resumoSolicitacoesDaCasa } from "@/server/dados/solicitacoes";
import { ROTULO_CATEGORIA } from "@/lib/solicitacoes";
import { Cartao } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { TituloSecao } from "@/components/ui/painel";
import { EtiquetaSolicitacao } from "./pecas";

export async function WidgetSolicitacoes({ ctx }: { ctx: Contexto }) {
  let resumo: Awaited<ReturnType<typeof resumoSolicitacoesDaCasa>>;
  try {
    resumo = await resumoSolicitacoesDaCasa(ctx);
  } catch (erro) {
    console.error("Início: não foi possível carregar as solicitações", erro);
    return null;
  }
  if (!resumo) return null;

  return (
    <section aria-labelledby="titulo-widget-solicitacoes" className="flex flex-col gap-3">
      <TituloSecao
        id="titulo-widget-solicitacoes"
        extra={resumo.ativas ? `${resumo.ativas} em aberto` : undefined}
      >
        Solicitações
      </TituloSecao>
      <Cartao className="flex flex-col gap-3 p-4">
        {resumo.recentes.length === 0 ? (
          <p className="flex items-start gap-2 text-ink-2">
            <ClipboardList aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" />
            Viu algo para consertar ou quer sugerir uma melhoria? Avise a administração e acompanhe pelo protocolo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resumo.recentes.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/solicitacoes/${s.id}`}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-3 py-2 transition-shadow active:shadow-afundado"
                >
                  <span className="min-w-0 flex-1">
                    <b className="block tabular-nums text-ink">Nº {s.protocolo}</b>
                    <span className="block truncate text-[0.88rem] text-muted">
                      {ROTULO_CATEGORIA[s.categoria]} · {s.local}
                    </span>
                  </span>
                  <EtiquetaSolicitacao status={s.status} />
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <BotaoLink href="/solicitacoes?nova=1" tamanho="pequeno" icone={<ClipboardPlus aria-hidden className="size-4" />}>
            Informar um problema
          </BotaoLink>
          {resumo.recentes.length ? (
            <BotaoLink href="/solicitacoes" variante="secundario" tamanho="pequeno" icone={<ClipboardList aria-hidden className="size-4" />}>
              Ver todas
            </BotaoLink>
          ) : null}
        </div>
      </Cartao>
    </section>
  );
}
