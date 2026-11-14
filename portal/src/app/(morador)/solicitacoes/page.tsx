import type { Metadata } from "next";
import { ClipboardList, ClipboardPlus } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { solicitacoesDaMinhaCasa } from "@/server/dados/solicitacoes";
import { estaAtiva } from "@/lib/solicitacoes";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { FormularioAbrirSolicitacao } from "@/components/solicitacoes/formulario-abrir";
import { ItemSolicitacao } from "@/components/solicitacoes/pecas";

export const metadata: Metadata = { title: "Solicitações" };

/**
 * Solicitações do morador (com login). Só aparecem as da PRÓPRIA casa.
 * "?nova=1" abre o formulário já aberto (atalho do Início).
 */
export default async function SolicitacoesMorador({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("solicitacoes.abrir", "/solicitacoes");
  const params = await searchParams;
  const lista = await solicitacoesDaMinhaCasa(ctx);
  const ativas = lista.filter((s) => estaAtiva(s.status));
  const encerradas = lista.filter((s) => !estaAtiva(s.status));
  const formularioAberto = params.nova === "1" || lista.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Serviços"
        titulo="Solicitações"
        subtitulo="Avise a administração sobre problemas, reclamações ou sugestões. Cada pedido recebe um número de protocolo."
      />

      {!ctx.unitId ? (
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para abrir solicitações, peça à administração para ligar seu cadastro à sua casa.
        </Alerta>
      ) : (
        <Cartao semEspaco>
          <details open={formularioAberto} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-bold text-destaque">
              <ClipboardPlus aria-hidden className="size-6 shrink-0" />
              <span className="flex-1 text-[1.1rem]">Abrir nova solicitação</span>
              <span className="text-[0.88rem] font-normal text-muted group-open:hidden">toque para abrir</span>
            </summary>
            <div className="border-t border-line p-5">
              <FormularioAbrirSolicitacao />
            </div>
          </details>
        </Cartao>
      )}

      <section aria-labelledby="titulo-ativas" className="flex flex-col gap-3">
        <TituloSecao id="titulo-ativas" extra={ativas.length ? `${ativas.length} em aberto` : undefined}>
          Em aberto
        </TituloSecao>
        {ativas.length === 0 ? (
          <EstadoVazio icone={ClipboardList} titulo="Nenhuma solicitação em aberto">
            Quando você enviar uma solicitação, ela aparece aqui com a situação e as respostas da administração.
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {ativas.map((s) => (
              <li key={s.id}>
                <ItemSolicitacao s={s} href={`/solicitacoes/${s.id}`} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {encerradas.length ? (
        <section aria-labelledby="titulo-encerradas" className="flex flex-col gap-3">
          <TituloSecao id="titulo-encerradas" extra={`${encerradas.length}`}>
            Resolvidas e canceladas
          </TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {encerradas.map((s) => (
              <li key={s.id}>
                <ItemSolicitacao s={s} href={`/solicitacoes/${s.id}`} fuso={ctx.fuso} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
