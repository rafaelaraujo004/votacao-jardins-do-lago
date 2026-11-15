import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, EyeOff } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterEnqueteMorador } from "@/server/dados/enquetes";
import { diaMes } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";
import { Alerta, Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { BarrasResultado, EtiquetaEnquete } from "@/components/enquetes/pecas";
import { FormularioVoto } from "@/components/enquetes/formulario-voto";

export const metadata: Metadata = { title: "Enquete" };

/**
 * Uma enquete para o morador: votar (uma vez por casa) e ver o resultado
 * quando a regra deixar. Nunca mostra o voto de outras casas, só totais.
 */
export default async function EnqueteMoradorPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao("enquetes.votar", valido ? `/enquetes/${id}` : "/enquetes");
  if (!valido) notFound();
  const e = await obterEnqueteMorador(ctx, id);
  if (!e) notFound();

  const voto = e.meuVoto;
  const podeVotar = e.situacao === "aberta" && !voto && !!ctx.unitId;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/enquetes" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Enquetes
      </Link>

      <CabecalhoPagina sobretitulo="Enquete" titulo={e.pergunta} subtitulo={e.descricao || undefined}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EtiquetaEnquete situacao={e.situacao} />
          <span className="text-[0.9rem] text-muted">
            {e.situacao === "agendada"
              ? `Abre ${formatarDataHora(e.abreEm, ctx.fuso)}`
              : e.situacao === "aberta"
                ? `Vote até ${formatarDataHora(e.fechaEm, ctx.fuso)}`
                : "Votação encerrada"}
          </span>
        </div>
      </CabecalhoPagina>

      {voto ? (
        <Alerta tipo="sucesso" titulo="Sua casa já votou">
          Sua casa votou em <b>“{voto.opcaoTexto}”</b>
          {voto.votadoEm ? ` em ${diaMes(voto.votadoEm, ctx.fuso)}` : ""}
          {voto.porMim ? " (por você)" : " (por outra pessoa da sua casa)"}. O voto não pode ser mudado.
        </Alerta>
      ) : null}

      {podeVotar ? (
        <Cartao>
          <FormularioVoto enqueteId={e.id} opcoes={e.opcoes} />
        </Cartao>
      ) : e.situacao === "aberta" && !voto && !ctx.unitId ? (
        <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
          Para votar, peça à administração para ligar seu cadastro à sua casa.
        </Alerta>
      ) : e.situacao === "agendada" ? (
        <Alerta tipo="info" titulo="A votação ainda não abriu">
          Volte a partir de {formatarDataHora(e.abreEm, ctx.fuso)} para votar.
        </Alerta>
      ) : e.situacao === "encerrada" && !voto ? (
        <Alerta tipo="info" titulo="Votação encerrada">
          Sua casa não votou nesta enquete.
        </Alerta>
      ) : null}

      <section aria-labelledby="titulo-resultado" className="flex flex-col gap-3">
        <TituloSecao
          id="titulo-resultado"
          extra={e.totalVotos !== null ? `${e.totalVotos} ${e.totalVotos === 1 ? "voto" : "votos"}` : undefined}
        >
          {e.situacao === "encerrada" ? "Resultado final" : "Resultado parcial"}
        </TituloSecao>
        {e.totais ? (
          <Cartao>
            <BarrasResultado opcoes={e.opcoes} totais={e.totais} encerrada={e.situacao === "encerrada"} minhaOpcaoId={voto?.opcaoId ?? null} />
          </Cartao>
        ) : (
          <Cartao className="flex items-start gap-3 text-ink-2">
            <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
            <p>
              O resultado aparece quando a votação encerrar
              {e.situacao !== "encerrada" ? `, em ${formatarDataHora(e.fechaEm, ctx.fuso)}` : ""}. Assim ninguém é influenciado
              pela parcial.
            </p>
          </Cartao>
        )}
        <p className="flex items-start gap-2 text-[0.9rem] text-muted">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          Cada casa vota uma vez. A administração vê só os totais, nunca o voto de cada casa.
        </p>
      </section>
    </div>
  );
}
