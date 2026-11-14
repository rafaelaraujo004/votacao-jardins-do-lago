import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { solicitacaoParaGestao } from "@/server/dados/solicitacoes";
import { idDocumento } from "@/lib/validacao";
import { TRANSICOES } from "@/lib/solicitacoes";
import { Cartao, TituloPagina } from "@/components/ui/basicos";
import { TituloSecao } from "@/components/ui/painel";
import { LinhaDoTempo, ResumoSolicitacao } from "@/components/solicitacoes/pecas";
import { FormularioResposta, FormularioStatus } from "@/components/solicitacoes/formularios";

export const metadata: Metadata = { title: "Solicitação" };

/** Detalhe para a administração: casa, linha do tempo completa (com notas internas) e ações. */
export default async function SolicitacaoGestao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("solicitacoes.gerenciar", `/admin/solicitacoes/${encodeURIComponent(id)}`);
  if (!idDocumento.safeParse(id).success) notFound();
  const dados = await solicitacaoParaGestao(ctx, id);
  if (!dados) notFound();
  const { solicitacao: s, linhaDoTempo } = dados;
  const internas = linhaDoTempo.filter((a) => !a.publico).length;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/solicitacoes" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Todas as solicitações
      </Link>

      <TituloPagina sobretitulo="Solicitação" titulo={`Protocolo ${s.protocolo}`} descricao={`${s.unidadeRotulo} · ${s.local}`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Cartao>
            <ResumoSolicitacao s={s} fuso={ctx.fuso} mostrarCasa />
          </Cartao>

          <section aria-labelledby="titulo-andamento" className="flex flex-col gap-3">
            <TituloSecao id="titulo-andamento" extra={internas ? `${internas} ${internas === 1 ? "nota interna" : "notas internas"}` : undefined}>
              Andamento
            </TituloSecao>
            <Cartao>
              <LinhaDoTempo itens={linhaDoTempo} fuso={ctx.fuso} criadoEm={s.criadoEm} />
            </Cartao>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <Cartao className="flex flex-col gap-3">
            <h2 className="text-[1.1rem] font-bold text-destaque">Mudar a situação</h2>
            <FormularioStatus id={s.id} opcoes={TRANSICOES[s.status]} />
          </Cartao>
          <Cartao className="flex flex-col gap-3">
            <h2 className="text-[1.1rem] font-bold text-destaque">Responder ou anotar</h2>
            <FormularioResposta id={s.id} />
          </Cartao>
        </div>
      </div>
    </div>
  );
}
