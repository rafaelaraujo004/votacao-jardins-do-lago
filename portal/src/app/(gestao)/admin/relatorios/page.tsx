import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import {
  relatorioFinanceiro,
  relatorioPortaria,
  relatorioReservas,
  relatorioSolicitacoes,
} from "@/server/dados/relatorios";
import { hojeISO } from "@/lib/formato";
import { ASSUNTOS_RELATORIO, NOME_ASSUNTO, anoValido, anosDoSeletor, ehAssunto, type AssuntoRelatorio } from "@/lib/relatorios";
import { Alerta, Cartao, TituloPagina } from "@/components/ui/basicos";
import { SegmentoLinks } from "@/components/ui/painel";
import { AvisoIncompleto, BotaoCsv } from "@/components/relatorios/pecas";
import {
  RelatorioFinanceiroVista,
  RelatorioPortariaVista,
  RelatorioReservasVista,
  RelatorioSolicitacoesVista,
} from "@/components/relatorios/secoes";

export const metadata: Metadata = { title: "Relatórios" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Link da tela mantendo assunto e ano. */
const link = (assunto: AssuntoRelatorio, ano: number) => `/admin/relatorios?assunto=${assunto}&ano=${ano}`;

/** Carrega e desenha SÓ o relatório escolhido (as outras coleções nem são lidas). */
async function Conteudo({ assunto, ano, ctx }: { assunto: AssuntoRelatorio; ano: number; ctx: Awaited<ReturnType<typeof exigirPermissao>> }) {
  switch (assunto) {
    case "financeiro": {
      const r = await relatorioFinanceiro(ctx, ano);
      if (!r) {
        return (
          <Alerta tipo="info" titulo="Sem acesso ao financeiro">
            Seu perfil vê relatórios, mas não a prestação de contas. Peça ao síndico, se precisar.
          </Alerta>
        );
      }
      return <RelatorioFinanceiroVista r={r} />;
    }
    case "reservas": {
      const { dados, incompleto } = await relatorioReservas(ctx, ano);
      return (
        <>
          <AvisoIncompleto incompleto={incompleto} />
          <RelatorioReservasVista r={dados} />
        </>
      );
    }
    case "portaria": {
      const { dados, incompleto } = await relatorioPortaria(ctx, ano);
      return (
        <>
          <AvisoIncompleto incompleto={incompleto} />
          <RelatorioPortariaVista r={dados} />
        </>
      );
    }
    case "solicitacoes": {
      const { dados, incompleto } = await relatorioSolicitacoes(ctx, ano);
      return (
        <>
          <AvisoIncompleto incompleto={incompleto} />
          <RelatorioSolicitacoesVista r={dados} />
        </>
      );
    }
  }
}

export default async function Relatorios({ searchParams }: Props) {
  const ctx = await exigirPermissao("relatorios.ver", "/admin/relatorios");
  const anoAtual = Number(hojeISO(new Date(), ctx.fuso).slice(0, 4));
  const consulta = await searchParams;
  const assunto: AssuntoRelatorio = ehAssunto(consulta.assunto) ? consulta.assunto : "financeiro";
  const ano = anoValido(consulta.ano, anoAtual);

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Gestão"
        titulo="Relatórios"
        descricao="Totais do ano para prestar contas e planejar. Nenhum relatório mostra nomes ou casas."
      />

      <Cartao className="flex flex-col gap-3">
        <SegmentoLinks
          rotulo="Assunto do relatório"
          rolavel
          ariaCurrent="page"
          opcoes={ASSUNTOS_RELATORIO.map((a) => ({ rotulo: NOME_ASSUNTO[a], href: link(a, ano), ativo: a === assunto }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentoLinks
            rotulo="Ano"
            rolavel
            ariaCurrent="page"
            opcoes={anosDoSeletor(anoAtual).map((a) => ({ rotulo: String(a), href: link(assunto, a), ativo: a === ano }))}
          />
          <BotaoCsv assunto={assunto} ano={ano} />
        </div>
        {ano === anoAtual ? <p className="text-[0.88rem] text-muted">{ano} ainda está em andamento: os números vão até hoje.</p> : null}
      </Cartao>

      <Conteudo assunto={assunto} ano={ano} ctx={ctx} />
    </div>
  );
}
