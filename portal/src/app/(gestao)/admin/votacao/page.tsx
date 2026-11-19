import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Vote } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import {
  listarEleicoesGestao,
  type EleicaoGestao,
} from "@/server/dados/eleicoes";
import { casas, participacao } from "@/lib/enquetes";
import { regraTexto, type SituacaoEleicao } from "@/lib/eleicoes";
import { formatarDataHora } from "@/lib/formato";
import { EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BlocoNumero, SegmentoLinks } from "@/components/ui/painel";
import { EtiquetaEleicao } from "@/components/eleicoes/pecas";

export const metadata: Metadata = { title: "Votação oficial" };

const FILTROS = [
  {
    id: "andamento",
    rotulo: "Em andamento",
    situacoes: ["aberta", "agendada"],
  },
  { id: "rascunhos", rotulo: "Rascunhos", situacoes: ["rascunho"] },
  { id: "encerradas", rotulo: "Encerradas", situacoes: ["encerrada"] },
  {
    id: "todas",
    rotulo: "Todas",
    situacoes: ["rascunho", "agendada", "aberta", "encerrada"],
  },
] as const satisfies readonly {
  id: string;
  rotulo: string;
  situacoes: readonly SituacaoEleicao[];
}[];

/** Eleições da comissão. Mostra participação; o resultado só depois do encerramento. */
export default async function VotacaoGestao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("eleicoes.gerenciar");
  const [eleicoes, params] = await Promise.all([
    listarEleicoesGestao(ctx),
    searchParams,
  ]);

  const conta = (s: SituacaoEleicao) =>
    eleicoes.filter((e) => e.situacao === s).length;
  const filtro = FILTROS.find((f) => f.id === params.ver) ?? FILTROS[0];
  const lista = eleicoes.filter((e) =>
    (filtro.situacoes as readonly SituacaoEleicao[]).includes(e.situacao),
  );

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Votação oficial"
        descricao="Eleições com voto secreto: um voto por casa, resultado só no encerramento."
        acoes={
          <BotaoLink
            href="/admin/votacao/nova"
            icone={<Plus aria-hidden className="size-5" />}
          >
            Nova votação
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero
          rotulo="Abertas"
          valor={conta("aberta")}
          detalhe="recebendo votos"
          cor="pine"
        />
        <BlocoNumero
          rotulo="Agendadas"
          valor={conta("agendada")}
          detalhe="publicadas"
          cor="lake"
        />
        <BlocoNumero
          rotulo="Rascunhos"
          valor={conta("rascunho")}
          detalhe="não publicadas"
          cor={conta("rascunho") ? "laranja" : "ink"}
        />
      </div>

      <SegmentoLinks
        rotulo="Filtrar votações"
        rolavel
        ariaCurrent="page"
        opcoes={FILTROS.map((f) => ({
          rotulo: f.rotulo,
          href: `/admin/votacao?ver=${f.id}`,
          ativo: f.id === filtro.id,
        }))}
      />

      {lista.length === 0 ? (
        <EstadoVazio
          icone={Vote}
          titulo={
            eleicoes.length === 0 ? "Nenhuma votação ainda" : "Nada por aqui"
          }
          acao={<BotaoLink href="/admin/votacao/nova">Criar votação</BotaoLink>}
        >
          {eleicoes.length === 0
            ? "Crie a primeira: nome da eleição, vagas, horário e os candidatos."
            : "Nenhuma votação neste filtro. Escolha outro filtro acima."}
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((e) => (
            <li key={e.id}>
              <ItemEleicao eleicao={e} fuso={ctx.fuso} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemEleicao({
  eleicao: e,
  fuso,
}: {
  eleicao: EleicaoGestao;
  fuso: string;
}) {
  const prazo =
    e.situacao === "rascunho" || e.situacao === "agendada"
      ? `Abre ${formatarDataHora(e.abreEm, fuso)}`
      : e.situacao === "aberta"
        ? `Encerra ${formatarDataHora(e.fechaEm, fuso)}`
        : `Encerrada ${formatarDataHora(e.fechaEm, fuso)}`;
  return (
    <Link
      href={`/admin/votacao/${e.id}`}
      className="saltado flex items-center gap-3 rounded-2xl p-4 transition-shadow active:shadow-afundado"
    >
      <span className="min-w-0 flex-1">
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <EtiquetaEleicao situacao={e.situacao} />
        </span>
        <b className="block break-words text-ink">{e.titulo}</b>
        <span className="block text-[0.9rem] text-ink-2">
          {prazo} · {regraTexto(e)}
          {e.situacao === "rascunho"
            ? ` · ${e.candidatos.length} ${e.candidatos.length === 1 ? "candidato" : "candidatos"}`
            : ` · ${casas(e.votaram)} de ${e.casasAptas} votaram (${participacao(e.votaram, e.casasAptas)}%)`}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
    </Link>
  );
}
