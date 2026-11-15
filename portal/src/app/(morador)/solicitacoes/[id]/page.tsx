import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, XCircle } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { solicitacaoDaMinhaCasa } from "@/server/dados/solicitacoes";
import { cancelarSolicitacao } from "@/server/acoes/solicitacoes";
import { idDocumento } from "@/lib/validacao";
import { podeCancelarMorador, podeComentarMorador } from "@/lib/solicitacoes";
import { Alerta, Cartao } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { LinhaDoTempo, ResumoSolicitacao } from "@/components/solicitacoes/pecas";
import { FormularioComentario } from "@/components/solicitacoes/formularios";

export const metadata: Metadata = { title: "Solicitação" };

/** Detalhe de uma solicitação da PRÓPRIA casa. De outra casa = "não encontrada". */
export default async function SolicitacaoMorador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("solicitacoes.abrir", `/solicitacoes/${encodeURIComponent(id)}`);
  if (!idDocumento.safeParse(id).success) notFound();
  const dados = await solicitacaoDaMinhaCasa(ctx, id);
  if (!dados) notFound();
  const { solicitacao: s, linhaDoTempo } = dados;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/solicitacoes" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Minhas solicitações
      </Link>

      <CabecalhoPagina sobretitulo="Solicitação" titulo={`Protocolo ${s.protocolo}`} subtitulo="Guarde este número para falar com a administração." />

      <Cartao>
        <ResumoSolicitacao s={s} fuso={ctx.fuso} />
        {podeCancelarMorador(s.status) ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <AcaoConfirmada
              acao={cancelarSolicitacao}
              campos={{ id: s.id }}
              titulo="Cancelar esta solicitação?"
              mensagem={`Protocolo ${s.protocolo}. Use quando o problema já foi resolvido ou se abriu por engano. O registro continua no histórico.`}
              textoConfirmar="Sim, cancelar"
              perigo
            >
              <XCircle aria-hidden className="size-4" /> Cancelar solicitação
            </AcaoConfirmada>
          </div>
        ) : null}
      </Cartao>

      <section aria-labelledby="titulo-andamento" className="flex flex-col gap-3">
        <TituloSecao id="titulo-andamento">Andamento</TituloSecao>
        <Cartao>
          <LinhaDoTempo itens={linhaDoTempo} fuso={ctx.fuso} criadoEm={s.criadoEm} />
        </Cartao>
      </section>

      {podeComentarMorador(s.status) ? (
        <Cartao>
          <FormularioComentario id={s.id} />
        </Cartao>
      ) : (
        <Alerta tipo="info" titulo="Solicitação encerrada">
          Se o problema continuar ou voltar, abra uma nova solicitação.
        </Alerta>
      )}
    </div>
  );
}
