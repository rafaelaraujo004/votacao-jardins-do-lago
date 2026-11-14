/**
 * O conteúdo de cada relatório (só totais, nenhum dado pessoal).
 * Recebem os números prontos de src/server/dados/relatorios.ts.
 */
import { CalendarDays, ClipboardList, DoorOpen, Wallet } from "lucide-react";
import { cx } from "@/lib/cx";
import {
  DIAS_CURTOS,
  DIAS_DA_SEMANA,
  descreverDuracao,
  mesCurto,
  type RelatorioFinanceiro,
  type RelatorioPortaria,
  type RelatorioReservas,
  type RelatorioSolicitacoes,
} from "@/lib/relatorios";
import { EstadoVazio } from "@/components/ui/basicos";
import { BlocoNumero } from "@/components/ui/painel";
import { Moeda } from "@/components/financeiro/pecas";
import { GraficoBarras } from "./grafico-barras";
import { SecaoRelatorio, TabelaRelatorio } from "./pecas";

const n = (v: number) => v.toLocaleString("pt-BR");

// ---------- Financeiro ----------

export function RelatorioFinanceiroVista({ r }: { r: RelatorioFinanceiro }) {
  const temMovimento = r.linhas.some((l) => l.saldoFinalCentavos !== null);
  if (!temMovimento) {
    return (
      <EstadoVazio icone={Wallet} titulo={`Nenhum lançamento em ${r.ano}`}>
        Quando houver receitas e despesas lançadas neste ano, o resumo aparece aqui.
      </EstadoVazio>
    );
  }
  const resultado = r.totais.resultadoCentavos;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BlocoNumero rotulo="Receitas" valor={<Moeda centavos={r.totais.receitasCentavos} />} detalhe="entrou no ano" cor="pine" />
        <BlocoNumero rotulo="Despesas" valor={<Moeda centavos={r.totais.despesasCentavos} />} detalhe="saiu no ano" cor="plum" />
        <BlocoNumero
          rotulo="Resultado"
          valor={<Moeda centavos={resultado} sinal />}
          detalhe={resultado >= 0 ? "sobrou no ano" : "faltou no ano"}
          cor={resultado >= 0 ? "pine" : "plum"}
        />
        <BlocoNumero
          rotulo="Saldo"
          valor={<span className={cx((r.saldoFinalCentavos ?? 0) < 0 && "text-danger")}><Moeda centavos={r.saldoFinalCentavos ?? 0} /></span>}
          detalhe="no último mês com lançamentos"
        />
      </div>

      <SecaoRelatorio id="fin-meses" titulo="Mês a mês">
        <GraficoBarras
          colunas={r.linhas.map((l) => mesCurto(l.mes))}
          series={[
            { nome: "Receitas", cor: "pine", valores: r.linhas.map((l) => l.receitasCentavos) },
            { nome: "Despesas", cor: "plum", valores: r.linhas.map((l) => l.despesasCentavos) },
          ]}
          emReais
          descricao={`Receitas e despesas de cada mês de ${r.ano}, em reais.`}
        />
        <TabelaRelatorio
          legenda={`Receitas, despesas e saldo por mês em ${r.ano}`}
          cabecalho={["Mês", "Receitas", "Despesas", "Resultado", "Saldo no fim"]}
          linhas={r.linhas.map((l) => [
            <span key="m" className="inline-flex items-center gap-1.5">
              {mesCurto(l.mes)}
              {l.saldoFinalCentavos !== null && !l.publicado ? <span className="text-[0.78rem] text-muted">(não publicado)</span> : null}
            </span>,
            <Moeda key="r" centavos={l.receitasCentavos} />,
            <Moeda key="d" centavos={l.despesasCentavos} />,
            <Moeda key="s" centavos={l.resultadoCentavos} sinal />,
            l.saldoFinalCentavos === null ? "—" : <Moeda key="f" centavos={l.saldoFinalCentavos} />,
          ])}
          rodape={[
            "Total do ano",
            <Moeda key="r" centavos={r.totais.receitasCentavos} />,
            <Moeda key="d" centavos={r.totais.despesasCentavos} />,
            <Moeda key="s" centavos={resultado} sinal />,
            r.saldoFinalCentavos === null ? "—" : <Moeda key="f" centavos={r.saldoFinalCentavos} />,
          ]}
        />
      </SecaoRelatorio>

      <SecaoRelatorio id="fin-categorias" titulo="Por categoria">
        {r.categorias.length === 0 ? (
          <p className="text-ink-2">Nenhuma categoria com valor neste ano.</p>
        ) : (
          <TabelaRelatorio
            legenda={`Totais por categoria em ${r.ano}`}
            cabecalho={["Categoria", "Tipo", "Total no ano"]}
            linhas={r.categorias.map((c) => [
              c.nome,
              <span key="t" className={c.tipo === "receita" ? "text-pine" : "text-plum"}>
                {c.tipo === "receita" ? "Receita" : "Despesa"}
              </span>,
              <Moeda key="v" centavos={c.totalCentavos} />,
            ])}
          />
        )}
      </SecaoRelatorio>
    </div>
  );
}

// ---------- Reservas ----------

export function RelatorioReservasVista({ r }: { r: RelatorioReservas }) {
  if (r.totais.total === 0) {
    return (
      <EstadoVazio icone={CalendarDays} titulo={`Nenhuma reserva em ${r.ano}`}>
        Quando os moradores reservarem as áreas de lazer, os números aparecem aqui.
      </EstadoVazio>
    );
  }
  const cab = ["Confirmadas", "Canceladas", "Fora do prazo", "Pendentes/recusadas", "Total"];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BlocoNumero rotulo="Pedidos" valor={n(r.totais.total)} detalhe="no ano" />
        <BlocoNumero rotulo="Confirmadas" valor={n(r.totais.confirmadas)} detalhe="reservas valendo" cor="pine" />
        <BlocoNumero rotulo="Canceladas" valor={n(r.totais.canceladas)} detalhe="desistências" cor="plum" />
        <BlocoNumero rotulo="Fora do prazo" valor={n(r.totais.tardias)} detalhe="canceladas em cima da hora" cor="laranja" />
      </div>

      <SecaoRelatorio id="res-meses" titulo="Mês a mês">
        <GraficoBarras
          colunas={r.porMes.map((m) => mesCurto(m.mes))}
          series={[
            { nome: "Confirmadas", cor: "pine", valores: r.porMes.map((m) => m.confirmadas) },
            { nome: "Canceladas", cor: "plum", valores: r.porMes.map((m) => m.canceladas) },
          ]}
          descricao={`Reservas confirmadas e canceladas por mês de ${r.ano} (pelo mês da data reservada).`}
        />
        <TabelaRelatorio
          legenda={`Reservas por mês em ${r.ano}`}
          cabecalho={["Mês", ...cab]}
          linhas={r.porMes.map((m) => [mesCurto(m.mes), n(m.confirmadas), n(m.canceladas), n(m.tardias), n(m.outras), n(m.total)])}
          rodape={["Total do ano", n(r.totais.confirmadas), n(r.totais.canceladas), n(r.totais.tardias), n(r.totais.outras), n(r.totais.total)]}
        />
      </SecaoRelatorio>

      <SecaoRelatorio id="res-areas" titulo="Por área">
        <TabelaRelatorio
          legenda={`Reservas por área em ${r.ano}`}
          cabecalho={["Área", ...cab]}
          linhas={r.porArea.map((a) => [a.area, n(a.confirmadas), n(a.canceladas), n(a.tardias), n(a.outras), n(a.total)])}
        />
      </SecaoRelatorio>
      <p className="text-[0.88rem] text-muted">
        Horários fechados pela administração (bloqueios) não entram na conta. &quot;Fora do prazo&quot; são cancelamentos feitos depois do
        prazo de desistência da área.
      </p>
    </div>
  );
}

// ---------- Portaria ----------

export function RelatorioPortariaVista({ r }: { r: RelatorioPortaria }) {
  if (r.entradas.total === 0 && r.encomendas.recebidas === 0) {
    return (
      <EstadoVazio icone={DoorOpen} titulo={`Nenhum registro da portaria em ${r.ano}`}>
        Entradas e encomendas registradas pela portaria aparecem aqui como totais.
      </EstadoVazio>
    );
  }
  const maiorDia = Math.max(...r.entradas.porDiaSemana);
  const diaMaisMovimentado = maiorDia > 0 ? DIAS_DA_SEMANA[r.entradas.porDiaSemana.indexOf(maiorDia)] : "—";
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BlocoNumero rotulo="Entradas" valor={n(r.entradas.total)} detalhe="registradas no ano" cor="lake" />
        <BlocoNumero rotulo="Dia mais cheio" valor={diaMaisMovimentado} detalhe="mais entradas" />
        <BlocoNumero rotulo="Encomendas" valor={n(r.encomendas.recebidas)} detalhe={`${n(r.encomendas.entregues)} entregues`} cor="pine" />
        <BlocoNumero
          rotulo="Tempo de retirada"
          valor={descreverDuracao(r.encomendas.tempoMedioHoras)}
          detalhe="média até o morador buscar"
          cor="plum"
        />
      </div>

      <SecaoRelatorio id="port-semana" titulo="Entradas por dia da semana">
        <GraficoBarras
          colunas={DIAS_CURTOS}
          series={[{ nome: "Entradas", cor: "lake", valores: r.entradas.porDiaSemana }]}
          descricao={`Total de entradas em cada dia da semana, em ${r.ano}.`}
        />
      </SecaoRelatorio>

      <SecaoRelatorio id="port-meses" titulo="Mês a mês">
        <GraficoBarras
          colunas={r.entradas.porMes.map((m) => mesCurto(m.mes))}
          series={[{ nome: "Entradas", cor: "lake", valores: r.entradas.porMes.map((m) => m.total) }]}
          descricao={`Entradas registradas em cada mês de ${r.ano}.`}
        />
        <TabelaRelatorio
          legenda={`Entradas e encomendas por mês em ${r.ano}`}
          cabecalho={["Mês", "Entradas", "Encomendas recebidas", "Entregues"]}
          linhas={r.entradas.porMes.map((m, i) => [mesCurto(m.mes), n(m.total), n(r.encomendas.porMes[i].recebidas), n(r.encomendas.porMes[i].entregues)])}
          rodape={["Total do ano", n(r.entradas.total), n(r.encomendas.recebidas), n(r.encomendas.entregues)]}
        />
      </SecaoRelatorio>
      {r.encomendas.aguardando > 0 ? (
        <p className="text-[0.88rem] text-muted">
          {n(r.encomendas.aguardando)} {r.encomendas.aguardando === 1 ? "encomenda recebida neste ano ainda aguarda" : "encomendas recebidas neste ano ainda aguardam"} retirada.
        </p>
      ) : null}
    </div>
  );
}

// ---------- Solicitações ----------

export function RelatorioSolicitacoesVista({ r }: { r: RelatorioSolicitacoes }) {
  if (r.totais.abertas === 0 && r.totais.resolvidas === 0) {
    return (
      <EstadoVazio icone={ClipboardList} titulo={`Nenhuma solicitação em ${r.ano}`}>
        Quando os moradores informarem problemas pelo portal, os totais aparecem aqui.
      </EstadoVazio>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BlocoNumero rotulo="Abertas" valor={n(r.totais.abertas)} detalhe="no ano" cor="lake" />
        <BlocoNumero rotulo="Resolvidas" valor={n(r.totais.resolvidas)} detalhe="no ano" cor="pine" />
        <BlocoNumero rotulo="Sem solução" valor={n(r.totais.emAndamento)} detalhe="abertas ou em andamento" cor="laranja" />
        <BlocoNumero rotulo="Tempo médio" valor={descreverDuracao(r.tempoMedioHoras)} detalhe="para resolver" cor="plum" />
      </div>

      <SecaoRelatorio id="sol-meses" titulo="Mês a mês">
        <GraficoBarras
          colunas={r.porMes.map((m) => mesCurto(m.mes))}
          series={[
            { nome: "Abertas", cor: "lake", valores: r.porMes.map((m) => m.abertas) },
            { nome: "Resolvidas", cor: "pine", valores: r.porMes.map((m) => m.resolvidas) },
          ]}
          descricao={`Solicitações abertas e resolvidas em cada mês de ${r.ano}.`}
        />
        <TabelaRelatorio
          legenda={`Solicitações por mês em ${r.ano}`}
          cabecalho={["Mês", "Abertas", "Resolvidas"]}
          linhas={r.porMes.map((m) => [mesCurto(m.mes), n(m.abertas), n(m.resolvidas)])}
          rodape={["Total do ano", n(r.totais.abertas), n(r.totais.resolvidas)]}
        />
      </SecaoRelatorio>

      <SecaoRelatorio id="sol-categorias" titulo="Por categoria">
        <TabelaRelatorio
          legenda={`Solicitações por categoria em ${r.ano}`}
          cabecalho={["Categoria", "Abertas", "Resolvidas"]}
          linhas={r.porCategoria.map((c) => [c.categoria, n(c.abertas), n(c.resolvidas)])}
        />
      </SecaoRelatorio>
      {r.totais.canceladas > 0 ? (
        <p className="text-[0.88rem] text-muted">
          {n(r.totais.canceladas)} {r.totais.canceladas === 1 ? "solicitação aberta neste ano foi cancelada" : "solicitações abertas neste ano foram canceladas"}.
        </p>
      ) : null}
    </div>
  );
}
