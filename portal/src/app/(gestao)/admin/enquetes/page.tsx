import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Vote } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { contarCasasAtivas, listarEnquetesGestao, type EnqueteGestao } from "@/server/dados/enquetes";
import { casas, participacao, type SituacaoEnquete } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BlocoNumero, SegmentoLinks } from "@/components/ui/painel";
import { EtiquetaEnquete } from "@/components/enquetes/pecas";

export const metadata: Metadata = { title: "Enquetes" };

const FILTROS = [
  { id: "andamento", rotulo: "Em andamento", situacoes: ["aberta", "agendada"] },
  { id: "rascunhos", rotulo: "Rascunhos", situacoes: ["rascunho"] },
  { id: "encerradas", rotulo: "Encerradas", situacoes: ["encerrada"] },
  { id: "todas", rotulo: "Todas", situacoes: ["rascunho", "agendada", "aberta", "encerrada"] },
] as const satisfies readonly { id: string; rotulo: string; situacoes: readonly SituacaoEnquete[] }[];

/** Lista de enquetes do síndico. Mostra só TOTAIS (nunca o voto de cada casa). */
export default async function EnquetesGestao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await exigirPermissao("enquetes.gerenciar");
  const [enquetes, ativas, params] = await Promise.all([listarEnquetesGestao(ctx), contarCasasAtivas(ctx), searchParams]);

  const conta = (s: SituacaoEnquete) => enquetes.filter((e) => e.situacao === s).length;
  const filtro = FILTROS.find((f) => f.id === params.ver) ?? FILTROS[0];
  const lista = enquetes.filter((e) => (filtro.situacoes as readonly SituacaoEnquete[]).includes(e.situacao));

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Enquetes"
        descricao="Pergunte aos moradores e decida junto. Vale um voto por casa e você vê só os totais."
        acoes={
          <BotaoLink href="/admin/enquetes/nova" icone={<Plus aria-hidden className="size-5" />}>
            Nova enquete
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero rotulo="Abertas" valor={conta("aberta")} detalhe="recebendo votos" cor="pine" />
        <BlocoNumero rotulo="Rascunhos" valor={conta("rascunho")} detalhe="não publicadas" cor={conta("rascunho") ? "laranja" : "ink"} />
        <BlocoNumero rotulo="Casas ativas" valor={ativas} detalhe="podem votar" cor="lake" />
      </div>

      <SegmentoLinks
        rotulo="Filtrar enquetes"
        rolavel
        ariaCurrent="page"
        opcoes={FILTROS.map((f) => ({ rotulo: f.rotulo, href: `/admin/enquetes?ver=${f.id}`, ativo: f.id === filtro.id }))}
      />

      {lista.length === 0 ? (
        <EstadoVazio
          icone={Vote}
          titulo={enquetes.length === 0 ? "Nenhuma enquete ainda" : "Nada por aqui"}
          acao={<BotaoLink href="/admin/enquetes/nova">Criar enquete</BotaoLink>}
        >
          {enquetes.length === 0
            ? "Crie a primeira enquete: escreva a pergunta, as opções e o prazo para votar."
            : "Nenhuma enquete neste filtro. Escolha outro filtro acima."}
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((e) => (
            <li key={e.id}>
              <ItemEnquete enquete={e} ativas={ativas} fuso={ctx.fuso} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemEnquete({ enquete: e, ativas, fuso }: { enquete: EnqueteGestao; ativas: number; fuso: string }) {
  const prazo =
    e.situacao === "rascunho" || e.situacao === "agendada"
      ? `Abre ${formatarDataHora(e.abreEm, fuso)}`
      : e.situacao === "aberta"
        ? `Fecha ${formatarDataHora(e.fechaEm, fuso)}`
        : `Encerrada ${formatarDataHora(e.encerradaEm ?? e.fechaEm, fuso)}`;
  return (
    <Link
      href={`/admin/enquetes/${e.id}`}
      className="saltado flex items-center gap-3 rounded-2xl p-4 transition-shadow active:shadow-afundado"
    >
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <EtiquetaEnquete situacao={e.situacao} />
        </span>
        <b className="block break-words text-ink">{e.pergunta}</b>
        <span className="block text-[0.9rem] text-ink-2">
          {prazo}
          {e.situacao !== "rascunho"
            ? ` · ${casas(e.totalVotos)} de ${ativas} votaram (${participacao(e.totalVotos, ativas)}%)`
            : ` · ${e.opcoes.length} opções`}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}
