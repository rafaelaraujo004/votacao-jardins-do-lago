import type { Metadata } from "next";
import { FileDown, FileText, Plus, Send, Wallet } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { configFinanceira, lancamentosDoMes, listarCategorias, mesesComSaldo } from "@/server/dados/financeiro";
import { configurarSaldoInicial, criarCategoriasPadrao, publicarMes } from "@/server/acoes/financeiro";
import { hojeISO, formatarMoeda } from "@/lib/formato";
import { mesAnterior, mesSeguinte, nomeDoMes, REGEX_MES } from "@/lib/financeiro";
import { Alerta, Campo, Cartao, classeEntrada, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink, classesDoBotao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { CartoesResumo, ListaLancamentos, SeletorMes, SituacaoMes, TabelaEvolucao } from "@/components/financeiro/pecas";
import { BotaoEstornar } from "./botao-estornar";

export const metadata: Metadata = { title: "Prestação de contas" };

export default async function FinanceiroGestao({ searchParams }: PageProps<"/admin/financeiro">) {
  const ctx = await exigirPermissao("financeiro.ver");
  const mesAtual = hojeISO(new Date(), ctx.fuso).slice(0, 7);
  const { mes: mesBruto } = await searchParams;
  const mes = typeof mesBruto === "string" && REGEX_MES.test(mesBruto) && mesBruto <= mesAtual ? mesBruto : mesAtual;

  const [meses, categorias, lancamentos, config] = await Promise.all([
    mesesComSaldo(ctx),
    listarCategorias(ctx),
    lancamentosDoMes(ctx, mes),
    configFinanceira(ctx),
  ]);

  const podeLancar = ctx.permissoes.has("financeiro.lancar");
  const podePublicar = ctx.permissoes.has("financeiro.publicar");
  const doMes = meses.find((m) => m.mes === mes);
  const ultimoAteMes = [...meses].filter((m) => m.mes <= mes).pop();
  const saldoNoMes = ultimoAteMes?.saldoFinalCentavos ?? config.saldoInicialCentavos;
  const publicado = doMes?.publicado ?? false;
  const algumPublicado = meses.some((m) => m.publicado);
  const primeiroMes = config.mesInicial ?? meses[0]?.mes ?? mesAtual;

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Finanças"
        titulo="Prestação de contas"
        descricao="Receitas, despesas e saldo do Residencial Jardins do Lago. Nada é apagado: correções são feitas por estorno."
        acoes={
          podeLancar && categorias.length ? (
            <BotaoLink href={`/admin/financeiro/novo?mes=${mes}`} icone={<Plus aria-hidden className="size-5" />}>
              Novo lançamento
            </BotaoLink>
          ) : null
        }
      />

      {podeLancar && categorias.length === 0 ? (
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Primeiro passo: categorias</h2>
          <p className="text-ink-2">
            Crie as categorias iniciais (Energia elétrica, Água, Limpeza, Manutenção, Jardinagem, Segurança, Materiais, Serviços
            terceirizados, Outros e as de receitas).
          </p>
          <Formulario acao={criarCategoriasPadrao}>
            <div>
              <BotaoEnviar>Criar categorias</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>
      ) : null}

      {podePublicar && !algumPublicado ? (
        <details className="group rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card" open={!config.mesInicial}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-bold">
            <Wallet aria-hidden className="size-5 text-pine" />
            <span className="flex-1">
              Saldo inicial{config.mesInicial ? `: ${formatarMoeda(config.saldoInicialCentavos)} em ${nomeDoMes(config.mesInicial)}` : " (o que havia em caixa ao começar)"}
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <Formulario acao={configurarSaldoInicial} limparAoSalvar={false}>
              <p className="text-ink-2">Informe o saldo do caixa no início do primeiro mês controlado pelo portal. Depois da primeira publicação ele não muda mais.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="saldoInicial" rotulo="Saldo inicial (R$)">
                  <input id="saldoInicial" name="saldoInicial" inputMode="decimal" required placeholder="0,00" defaultValue={config.mesInicial ? formatarMoeda(config.saldoInicialCentavos).replace("R$", "").trim() : ""} className={classeEntrada} />
                </Campo>
                <Campo id="mesInicial" rotulo="A partir do mês">
                  <input id="mesInicial" name="mesInicial" type="month" required max={mesAtual} defaultValue={config.mesInicial ?? mesAtual} className={classeEntrada} />
                </Campo>
              </div>
              <div>
                <BotaoEnviar>Salvar saldo inicial</BotaoEnviar>
              </div>
            </Formulario>
          </div>
        </details>
      ) : null}

      <Cartao className="flex flex-col gap-4">
        <SeletorMes
          mes={mes}
          caminho="/admin/financeiro"
          anterior={mes > primeiroMes ? mesAnterior(mes) : null}
          proximo={mes < mesAtual ? mesSeguinte(mes) : null}
          situacao={<SituacaoMes publicado={publicado} />}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <a href={`/api/financeiro/exportar?mes=${mes}`} className={classesDoBotao("secundario", "pequeno")}>
            <FileDown aria-hidden className="size-4" /> Excel (CSV)
          </a>
          <a href={`/relatorio/financeiro?mes=${mes}`} className={classesDoBotao("secundario", "pequeno")} target="_blank" rel="noopener">
            <FileText aria-hidden className="size-4" /> Relatório para PDF
          </a>
          {podePublicar && !publicado && mes < mesAtual && lancamentos.length > 0 ? (
            <AcaoConfirmada
              acao={publicarMes}
              campos={{ mes }}
              titulo={`Publicar ${nomeDoMes(mes)}?`}
              mensagem="Os moradores passam a ver os totais e lançamentos deste mês. O mês fica fechado: correções depois só por estorno no mês atual."
              textoConfirmar="Sim, publicar"
              variante="primario"
            >
              <Send aria-hidden className="size-4" /> Publicar mês
            </AcaoConfirmada>
          ) : null}
        </div>
      </Cartao>

      <CartoesResumo
        saldo={saldoNoMes}
        receitas={doMes?.receitasCentavos ?? 0}
        despesas={doMes?.despesasCentavos ?? 0}
        rotuloSaldo={mes === mesAtual ? "Saldo disponível" : "Saldo no fim do mês"}
      />

      {mes === mesAtual && !publicado ? null : publicado ? (
        <Alerta tipo="sucesso" titulo="Mês publicado e fechado">Os moradores já podem ver este mês. Correções agora só por estorno no mês atual.</Alerta>
      ) : mes < mesAtual && lancamentos.length ? (
        <Alerta tipo="aviso" titulo="Mês ainda não publicado">Confira os lançamentos e publique para os moradores verem.</Alerta>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="titulo-lancamentos">
        <h2 id="titulo-lancamentos" className="text-xl font-bold">Lançamentos</h2>
        {lancamentos.length === 0 ? (
          <EstadoVazio
            icone={Wallet}
            titulo={`Nenhum lançamento em ${nomeDoMes(mes)}`}
            acao={podeLancar && categorias.length && !publicado ? <BotaoLink href={`/admin/financeiro/novo?mes=${mes}`}>Fazer o primeiro lançamento</BotaoLink> : null}
          />
        ) : (
          <ListaLancamentos
            lancamentos={lancamentos}
            acao={
              podeLancar
                ? (l) =>
                    !l.estornaId && !l.estornadoPor ? (
                      <BotaoEstornar id={l.id} descricao={l.descricao} valorCentavos={l.valorCentavos} />
                    ) : null
                : undefined
            }
          />
        )}
      </section>

      {meses.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-evolucao">
          <h2 id="titulo-evolucao" className="text-xl font-bold">Evolução</h2>
          <TabelaEvolucao meses={[...meses].reverse().slice(0, 12)} caminho="/admin/financeiro" />
        </section>
      ) : null}
    </div>
  );
}
