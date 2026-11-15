import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { listarSolicitacoes, numerosDasSolicitacoes } from "@/server/dados/solicitacoes";
import { CATEGORIAS_SOLICITACAO, ROTULO_CATEGORIA } from "@/lib/solicitacoes";
import { lerFiltrosSolicitacoes, type FiltrosSolicitacoes } from "@/lib/validacao-solicitacoes";
import { EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { BlocoNumero, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { ItemSolicitacao } from "@/components/solicitacoes/pecas";

export const metadata: Metadata = { title: "Solicitações" };

const OPCOES_STATUS: { valor: FiltrosSolicitacoes["status"]; rotulo: string }[] = [
  { valor: "ativas", rotulo: "Em aberto" },
  { valor: "aberta", rotulo: "Abertas" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "resolvida", rotulo: "Resolvidas" },
  { valor: "cancelada", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
];

/** Endereço da lista mantendo os filtros (só os que não são o padrão). */
function link(f: FiltrosSolicitacoes) {
  const p = new URLSearchParams();
  if (f.status !== "ativas") p.set("status", f.status);
  if (f.categoria !== "todas") p.set("categoria", f.categoria);
  const q = p.toString();
  return q ? `/admin/solicitacoes?${q}` : "/admin/solicitacoes";
}

export default async function SolicitacoesGestao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("solicitacoes.gerenciar", "/admin/solicitacoes");
  const filtros = lerFiltrosSolicitacoes(await searchParams);
  const [numeros, lista] = await Promise.all([numerosDasSolicitacoes(ctx), listarSolicitacoes(ctx, filtros)]);
  const filtrado = filtros.status !== "ativas" || filtros.categoria !== "todas";

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Serviços"
        titulo="Solicitações"
        descricao="Problemas, reclamações e sugestões enviados pelos moradores. Responda, mude a situação e acompanhe pelo protocolo."
      />

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero rotulo="Abertas" valor={numeros.abertas} detalhe="aguardando você" cor={numeros.abertas ? "laranja" : "ink"} />
        <BlocoNumero rotulo="Em andamento" valor={numeros.emAndamento} detalhe="sendo resolvidas" cor="lake" />
        <BlocoNumero rotulo="Resolvidas no mês" valor={numeros.resolvidasNoMes} detalhe="este mês" cor="pine" />
      </div>

      <section aria-labelledby="titulo-lista" className="flex flex-col gap-3">
        <TituloSecao id="titulo-lista" extra={`${lista.length} ${lista.length === 1 ? "solicitação" : "solicitações"}`}>
          Lista
        </TituloSecao>
        <SegmentoLinks
          rotulo="Filtrar pela situação"
          rolavel
          ariaCurrent="page"
          opcoes={OPCOES_STATUS.map((o) => ({
            rotulo: o.rotulo,
            href: link({ ...filtros, status: o.valor }),
            ativo: filtros.status === o.valor,
          }))}
        />
        <SegmentoLinks
          rotulo="Filtrar pelo assunto"
          rolavel
          ariaCurrent="page"
          opcoes={[
            { rotulo: "Todos os assuntos", href: link({ ...filtros, categoria: "todas" }), ativo: filtros.categoria === "todas" },
            ...CATEGORIAS_SOLICITACAO.map((c) => ({
              rotulo: ROTULO_CATEGORIA[c],
              href: link({ ...filtros, categoria: c }),
              ativo: filtros.categoria === c,
            })),
          ]}
        />

        {lista.length === 0 ? (
          <EstadoVazio
            icone={ClipboardList}
            titulo={filtrado ? "Nenhuma solicitação com esses filtros" : "Nenhuma solicitação em aberto"}
            acao={
              filtrado ? (
                <BotaoLink href="/admin/solicitacoes" variante="secundario">
                  Limpar filtros
                </BotaoLink>
              ) : null
            }
          >
            {filtrado
              ? "Troque a situação ou o assunto para ver outras solicitações."
              : "Quando um morador enviar um problema ou sugestão, ele aparece aqui."}
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {lista.map((s) => (
              <li key={s.id}>
                <ItemSolicitacao s={s} href={`/admin/solicitacoes/${s.id}`} fuso={ctx.fuso} mostrarCasa />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
