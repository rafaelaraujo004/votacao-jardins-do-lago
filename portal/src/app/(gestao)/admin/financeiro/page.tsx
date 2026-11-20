import type { Metadata } from "next";
import { Eye, EyeOff, FileDown, FileText, House, Plus, Send, Tags, Wallet } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { configFinanceira, contarCasasAtivas, lancamentosDoMes, listarCategorias, mesesComSaldo } from "@/server/dados/financeiro";
import { alternarCategoria, configurarSaldoInicial, criarCategoria, criarCategoriasPadrao, publicarMes, salvarQuadroCasas } from "@/server/acoes/financeiro";
import { hojeISO, formatarMoeda } from "@/lib/formato";
import { CAMPOS_QUADRO, LIMITE_OBSERVACAO_QUADRO, mesAnterior, mesSeguinte, nomeDoMes, REGEX_MES } from "@/lib/financeiro";
import { Alerta, Campo, Cartao, classeEntrada, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
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

  const [meses, categorias, lancamentos, config, casasAtivas] = await Promise.all([
    mesesComSaldo(ctx),
    listarCategorias(ctx),
    lancamentosDoMes(ctx, mes),
    configFinanceira(ctx),
    contarCasasAtivas(ctx),
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
            Crie as categorias iniciais: Despesas ordinárias e Despesas extraordinárias (como no relatório mensal), as de
            receitas e outras de apoio (Energia elétrica, Água, Manutenção…). As que não usar podem ser escondidas depois.
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

      {/* Quadro de casas: só em mês que já tem lançamentos (um mês vazio travaria a publicação dos seguintes). */}
      {podeLancar && lancamentos.length > 0 && (doMes?.quantidade ?? 0) > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-quadro">
          <h2 id="titulo-quadro" className="flex items-center gap-2 text-xl font-bold">
            <House aria-hidden className="size-5 text-pine" /> Quadro de casas de {nomeDoMes(mes)}
          </h2>
          <Cartao>
            <Formulario acao={salvarQuadroCasas} limparAoSalvar={false}>
              <p className="text-ink-2">
                Os números do quadro do relatório mensal. Só totais: nenhuma casa é identificada. Deixe em branco o que não souber.
                {publicado ? " O mês já foi publicado: a correção aparece na hora para os moradores." : " Os moradores veem quando o mês for publicado."}
              </p>
              <input type="hidden" name="mes" value={mes} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CAMPOS_QUADRO.map((c) => {
                  const salvo = doMes?.casas?.[c.chave];
                  const sugestao = c.chave === "total" && (salvo === null || salvo === undefined) ? casasAtivas : salvo;
                  return (
                    <Campo key={c.chave} id={`quadro-${c.chave}`} rotulo={c.rotulo}>
                      <input
                        id={`quadro-${c.chave}`}
                        name={c.chave}
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        autoComplete="off"
                        defaultValue={sugestao ?? ""}
                        className={classeEntrada}
                      />
                    </Campo>
                  );
                })}
              </div>
              <Campo id="quadro-observacao" rotulo="Observação (opcional)" dica="Ex.: isentas e boletos vencidos referentes ao mês anterior; valores pagos avulsos.">
                <input
                  id="quadro-observacao"
                  name="observacao"
                  maxLength={LIMITE_OBSERVACAO_QUADRO}
                  defaultValue={doMes?.casas?.observacao ?? ""}
                  className={classeEntrada}
                  aria-describedby="quadro-observacao-dica"
                />
              </Campo>
              <div>
                <BotaoEnviar>Salvar quadro de casas</BotaoEnviar>
              </div>
            </Formulario>
          </Cartao>
        </section>
      ) : null}

      {podeLancar && categorias.length ? (
        <details className="rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-bold">
            <Tags aria-hidden className="size-5 text-pine" />
            <span className="flex-1">Categorias ({categorias.filter((c) => c.ativa).length} aparecendo na tela de lançar)</span>
          </summary>
          <div className="flex flex-col gap-5 border-t border-line p-5">
            <p className="text-ink-2">Esconda as que não usa: elas saem da tela de lançar, mas os lançamentos antigos continuam com elas.</p>
            {(["receita", "despesa"] as const).map((tipo) => (
              <div key={tipo} className="flex flex-col gap-2">
                <h3 className="font-bold">{tipo === "receita" ? "Entradas (receitas)" : "Saídas (despesas)"}</h3>
                <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
                  {categorias
                    .filter((c) => c.tipo === tipo)
                    .map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={c.ativa ? "font-bold" : "text-muted"}>{c.nome}</span>
                          {c.ativa ? null : <Etiqueta tom="neutro" icone={EyeOff}>escondida</Etiqueta>}
                        </span>
                        <AcaoConfirmada
                          acao={alternarCategoria}
                          campos={{ id: c.id, ativa: c.ativa ? "nao" : "sim" }}
                          titulo={c.ativa ? `Esconder "${c.nome}"?` : `Mostrar "${c.nome}"?`}
                          mensagem={
                            c.ativa
                              ? "Ela sai da tela de lançar. Os lançamentos que já usam esta categoria continuam iguais."
                              : "Ela volta a aparecer na tela de lançar."
                          }
                          textoConfirmar={c.ativa ? "Esconder" : "Mostrar"}
                        >
                          {c.ativa ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                          {c.ativa ? "Esconder" : "Mostrar"}
                        </AcaoConfirmada>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <Formulario acao={criarCategoria}>
              <h3 className="font-bold">Nova categoria</h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <Campo id="nova-categoria-nome" rotulo="Nome">
                  <input id="nova-categoria-nome" name="nome" required minLength={3} maxLength={40} placeholder="Ex.: Fundo de obras" className={classeEntrada} />
                </Campo>
                <Campo id="nova-categoria-tipo" rotulo="Tipo">
                  <select id="nova-categoria-tipo" name="tipo" defaultValue="despesa" className={classeEntrada}>
                    <option value="despesa">Saída (despesa)</option>
                    <option value="receita">Entrada (receita)</option>
                  </select>
                </Campo>
              </div>
              <div>
                <BotaoEnviar variante="secundario">Criar categoria</BotaoEnviar>
              </div>
            </Formulario>
          </div>
        </details>
      ) : null}

      {meses.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="titulo-evolucao">
          <h2 id="titulo-evolucao" className="text-xl font-bold">Evolução</h2>
          <TabelaEvolucao meses={[...meses].reverse().slice(0, 12)} caminho="/admin/financeiro" />
        </section>
      ) : null}
    </div>
  );
}
