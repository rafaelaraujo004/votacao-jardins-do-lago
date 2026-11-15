import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, Lock, Pencil, Send } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { contarCasasAtivas, obterEnqueteGestao } from "@/server/dados/enquetes";
import { encerrarEnquete, publicarEnquete } from "@/server/acoes/enquetes";
import { casas, participacao } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { BlocoNumero, TituloSecao } from "@/components/ui/painel";
import { BarrasResultado, EtiquetaEnquete } from "@/components/enquetes/pecas";

export const metadata: Metadata = { title: "Enquete" };

/**
 * Detalhe da enquete para o síndico: datas, ações e o RESULTADO em totais.
 * De propósito, esta tela não lista os votos por casa (o voto é da casa, não do síndico).
 */
export default async function EnqueteGestao({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("enquetes.gerenciar");
  const { id } = await params;
  if (!idDocumento.safeParse(id).success) notFound();
  const [e, ativas] = await Promise.all([obterEnqueteGestao(ctx, id), contarCasasAtivas(ctx)]);
  if (!e) notFound();

  const rascunho = e.status === "rascunho";
  const faltam = Math.max(0, ativas - e.totalVotos);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/enquetes" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Enquetes
      </Link>

      <TituloPagina
        sobretitulo="Enquete"
        titulo={e.pergunta}
        descricao={e.descricao || undefined}
        acoes={<EtiquetaEnquete situacao={e.situacao} />}
      />

      <Cartao className="flex flex-col gap-2 text-ink-2">
        <p>
          <b className="text-ink">Abre:</b> {formatarDataHora(e.abreEm, ctx.fuso)}
        </p>
        <p>
          <b className="text-ink">Fecha:</b> {formatarDataHora(e.fechaEm, ctx.fuso)}
          {e.encerradaEm ? ` · encerrada antes, em ${formatarDataHora(e.encerradaEm, ctx.fuso)}` : ""}
        </p>
        <p>
          <b className="text-ink">Resultado para os moradores:</b>{" "}
          {e.resultado === "sempre" ? "sempre visível (parcial ao vivo)" : "só depois de encerrar"}
        </p>
        {e.criadoPorNome ? <p className="text-[0.9rem] text-muted">Criada por {e.criadoPorNome}.</p> : null}

        {rascunho ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <BotaoLink href={`/admin/enquetes/${e.id}/editar`} variante="secundario" icone={<Pencil aria-hidden className="size-4" />}>
              Editar rascunho
            </BotaoLink>
            <AcaoConfirmada
              acao={publicarEnquete}
              campos={{ id: e.id }}
              titulo="Publicar esta enquete?"
              mensagem={`Os moradores passam a ver a enquete e podem votar a partir de ${formatarDataHora(e.abreEm, ctx.fuso)}. Depois de publicada, ela não pode mais ser alterada.`}
              textoConfirmar="Sim, publicar"
              variante="primario"
            >
              <Send aria-hidden className="size-4" /> Publicar
            </AcaoConfirmada>
          </div>
        ) : e.status === "aberta" ? (
          <div className="mt-2">
            <AcaoConfirmada
              acao={encerrarEnquete}
              campos={{ id: e.id }}
              titulo="Encerrar a votação agora?"
              mensagem={`Ninguém mais poderá votar. ${casas(e.totalVotos)} de ${ativas} já votaram. Isso não pode ser desfeito.`}
              textoConfirmar="Sim, encerrar"
              perigo
            >
              <Lock aria-hidden className="size-4" /> Encerrar agora
            </AcaoConfirmada>
          </div>
        ) : null}
      </Cartao>

      {rascunho ? (
        <section aria-labelledby="titulo-opcoes" className="flex flex-col gap-3">
          <TituloSecao id="titulo-opcoes">Opções</TituloSecao>
          <Cartao>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              {e.opcoes.map((o) => (
                <li key={o.id} className="break-words">
                  {o.texto}
                </li>
              ))}
            </ol>
          </Cartao>
          <Alerta tipo="aviso" titulo="Ainda é rascunho">
            Os moradores não veem esta enquete. Confira tudo e toque em “Publicar”.
          </Alerta>
        </section>
      ) : (
        <section aria-labelledby="titulo-resultado" className="flex flex-col gap-3">
          <TituloSecao id="titulo-resultado" extra={e.situacao === "encerrada" ? "resultado final" : "parcial"}>
            Resultado
          </TituloSecao>
          <div className="grid grid-cols-3 gap-2.5">
            <BlocoNumero rotulo="Votaram" valor={e.totalVotos} detalhe={`de ${casas(ativas)}`} cor="pine" />
            <BlocoNumero rotulo="Participação" valor={`${participacao(e.totalVotos, ativas)}%`} detalhe="das casas ativas" cor="lake" />
            <BlocoNumero rotulo="Faltam" valor={faltam} detalhe={faltam === 1 ? "casa" : "casas"} cor="ink" />
          </div>
          <Cartao>
            <BarrasResultado opcoes={e.opcoes} totais={e.totais} encerrada={e.situacao === "encerrada"} />
          </Cartao>
          <p className="flex items-start gap-2 text-[0.9rem] text-muted">
            <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
            Você vê só os totais. O portal não mostra em que opção cada casa votou.
          </p>
        </section>
      )}
    </div>
  );
}
