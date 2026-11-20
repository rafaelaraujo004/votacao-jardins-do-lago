/**
 * Peças do financeiro usadas pelo síndico e pelos moradores (visual "Jardim macio").
 * Valores sempre com sinal, ícone e texto (não só cor).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  House,
  Paperclip,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { cx } from "@/lib/cx";
import { dataISOParaBR, formatarMoeda } from "@/lib/formato";
import { agruparPorCategoria, CAMPOS_QUADRO, FORMAS_PAGAMENTO, nomeDoMes, nomeDoMesTitulo, type MesComSaldo, type QuadroCasas } from "@/lib/financeiro";
import { Etiqueta } from "@/components/ui/basicos";
import { BlocoNumero, type CorNumero } from "@/components/ui/painel";
import type { Lancamento } from "@/server/dados/financeiro";
import { descreverComprovante } from "@/lib/comprovantes";
import { AnexarComprovante, RemoverComprovante } from "./comprovantes-lancamento";

/** Junta o caminho com ?mes=... e outros parâmetros extras (ex.: "periodo=12"). */
function linkDoMes(caminho: string, mes: string, consulta?: string) {
  return `${caminho}?mes=${mes}${consulta ? `&${consulta}` : ""}`;
}

/** Valor em reais com o "R$" pequeno (como nos blocos do modelo). Negativo ganha "−". */
export function Moeda({ centavos, sinal = false }: { centavos: number; sinal?: boolean }) {
  const numero = formatarMoeda(Math.abs(centavos)).replace(/^R\$\s?/, "");
  const prefixo = centavos < 0 ? "− " : sinal && centavos > 0 ? "+ " : "";
  return (
    <span className="whitespace-nowrap">
      {prefixo}
      <small className="mr-0.5 text-[0.62em] font-bold tracking-normal">R$</small>
      {numero}
    </span>
  );
}

// ---------- Blocos de número do mês ----------

/**
 * Blocos com rótulo em caixa alta. `lancamentos` e `categorias` (quantidades) são opcionais:
 * quando informados, a grade vira 3 colunas (2 no celular).
 */
export function CartoesResumo({
  saldo,
  receitas,
  despesas,
  rotuloSaldo = "Saldo disponível",
  lancamentos,
  categorias,
}: {
  saldo: number;
  receitas: number;
  despesas: number;
  rotuloSaldo?: string;
  lancamentos?: number;
  categorias?: number;
}) {
  const resultado = receitas - despesas;
  const blocos: { rotulo: string; valor: ReactNode; detalhe: string; cor: CorNumero }[] = [
    {
      rotulo: "Saldo",
      valor: <span className={cx(saldo < 0 && "text-danger")}><Moeda centavos={saldo} /></span>,
      detalhe: rotuloSaldo,
      cor: "ink",
    },
    { rotulo: "Receitas", valor: <Moeda centavos={receitas} />, detalhe: "entrou no mês", cor: "pine" },
    { rotulo: "Despesas", valor: <Moeda centavos={despesas} />, detalhe: "saiu no mês", cor: "plum" },
    {
      rotulo: "Resultado",
      valor: <Moeda centavos={resultado} sinal />,
      detalhe: resultado >= 0 ? "sobrou no mês" : "faltou no mês",
      cor: resultado >= 0 ? "pine" : "plum",
    },
  ];
  if (lancamentos !== undefined) {
    blocos.push({ rotulo: "Lançamentos", valor: lancamentos, detalhe: lancamentos === 1 ? "registro" : "registros", cor: "lake" });
  }
  if (categorias !== undefined) {
    blocos.push({ rotulo: "Categorias", valor: categorias, detalhe: "com despesas", cor: "laranja" });
  }
  return (
    <section
      aria-label="Resumo do mês"
      className={cx("grid grid-cols-2 gap-2.5", blocos.length > 4 ? "sm:grid-cols-3" : "lg:grid-cols-4")}
    >
      {blocos.map((b) => (
        <BlocoNumero key={b.rotulo} rotulo={b.rotulo} valor={b.valor} detalhe={b.detalhe} cor={b.cor} />
      ))}
    </section>
  );
}

// ---------- Cartão verde de destaque (saldo grande + resumo) ----------

export function DestaqueSaldo({ mes, saldoAnterior, receitas, despesas, saldoFinal }: {
  mes: string;
  saldoAnterior: number;
  receitas: number;
  despesas: number;
  saldoFinal: number;
}) {
  const resultado = receitas - despesas;
  const nomeMes = nomeDoMes(mes).split(" ")[0];
  return (
    <section
      aria-label={`Saldo de ${nomeDoMes(mes)}`}
      className="relative overflow-hidden rounded-[var(--radius-card)] bg-band p-5 text-band-fg shadow-card"
    >
      {/* brilho decorativo no canto (a faixa é escura nos dois temas) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -bottom-16 size-44 rounded-full bg-[radial-gradient(circle,rgb(233_223_196/0.18),transparent_70%)]"
      />
      <p className="text-[0.92rem] text-band-muted">Saldo no fim de {nomeMes}</p>
      <p className="mt-0.5 mb-3 font-display text-[clamp(1.8rem,8vw,2.2rem)] font-extrabold leading-tight tracking-tight tabular-nums">
        <Moeda centavos={saldoFinal} />
      </p>
      <dl className="relative z-[1] grid grid-cols-2 gap-2.5 tabular-nums">
        <div className="rounded-xl bg-band-fg/10 p-2.5">
          <dt className="text-[0.82rem] text-band-muted">Saldo anterior</dt>
          <dd className="font-bold"><Moeda centavos={saldoAnterior} /></dd>
        </div>
        <div className="rounded-xl bg-band-fg/10 p-2.5">
          <dt className="flex items-center gap-1 text-[0.82rem] text-band-muted">
            <ArrowDownLeft aria-hidden className="size-4 text-band-ok" /> Entrou
          </dt>
          <dd className="font-bold"><Moeda centavos={receitas} sinal /></dd>
        </div>
        <div className="rounded-xl bg-band-fg/10 p-2.5">
          <dt className="flex items-center gap-1 text-[0.82rem] text-band-muted">
            <ArrowUpRight aria-hidden className="size-4 text-band-alerta" /> Saiu
          </dt>
          <dd className="font-bold"><Moeda centavos={-despesas} /></dd>
        </div>
        <div className="rounded-xl bg-band-fg/10 p-2.5">
          <dt className="flex items-center gap-1 text-[0.82rem] text-band-muted">
            {resultado >= 0 ? (
              <TrendingUp aria-hidden className="size-4 text-band-ok" />
            ) : (
              <TrendingDown aria-hidden className="size-4 text-band-alerta" />
            )}
            {resultado >= 0 ? "Sobrou" : "Faltou"}
          </dt>
          <dd className="font-bold"><Moeda centavos={resultado} sinal /></dd>
        </div>
      </dl>
    </section>
  );
}

// ---------- Seletor de mês ----------

/** Seletor de mês: anterior · mês atual · próximo. `consulta` mantém outros filtros no link. */
export function SeletorMes({
  mes,
  anterior,
  proximo,
  caminho,
  situacao,
  consulta,
}: {
  mes: string;
  anterior: string | null;
  proximo: string | null;
  caminho: string;
  situacao?: ReactNode;
  consulta?: string;
}) {
  const botao = "grid size-12 shrink-0 place-items-center rounded-full text-destaque";
  const [nome, ano] = nomeDoMesTitulo(mes).split(" de ");
  return (
    <div className="flex items-center gap-2">
      {anterior ? (
        <Link href={linkDoMes(caminho, anterior, consulta)} className={cx(botao, "saltado active:shadow-afundado")} aria-label="Mês anterior">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
      ) : (
        <span className={cx(botao, "opacity-40")} aria-hidden><ChevronLeft className="size-6" /></span>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
        <h2 className="flex flex-col leading-tight">
          <span className="font-display text-[1.35rem] font-extrabold text-destaque">{nome}</span>
          <span className="text-[0.88rem] font-normal text-muted">{ano} · mês de referência</span>
        </h2>
        {situacao}
      </div>
      {proximo ? (
        <Link href={linkDoMes(caminho, proximo, consulta)} className={cx(botao, "saltado active:shadow-afundado")} aria-label="Próximo mês">
          <ChevronRight aria-hidden className="size-6" />
        </Link>
      ) : (
        <span className={cx(botao, "opacity-40")} aria-hidden><ChevronRight className="size-6" /></span>
      )}
    </div>
  );
}

export function SituacaoMes({ publicado }: { publicado: boolean }) {
  return publicado ? (
    <Etiqueta tom="ok" icone={CircleCheck}>Publicado</Etiqueta>
  ) : (
    <Etiqueta tom="aviso" icone={Clock}>Em aberto</Etiqueta>
  );
}

// ---------- Lista de lançamentos ----------

/**
 * Lista de lançamentos. `acao` permite pôr um botão (ex.: Estornar) em cada linha.
 * `gerenciarComprovantes`: mostra "Anexar comprovante" e o botão de remover (tela da gestão).
 */
export function ListaLancamentos({
  lancamentos,
  acao,
  gerenciarComprovantes = false,
}: {
  lancamentos: Lancamento[];
  acao?: (l: Lancamento) => ReactNode;
  gerenciarComprovantes?: boolean;
}) {
  return (
    <ul className="flex flex-col rounded-[var(--radius-card)] border border-borda-luz bg-surface px-4 py-1 shadow-card">
      {lancamentos.map((l) => (
        <LinhaLancamento key={l.id} l={l} acao={acao} gerenciarComprovantes={gerenciarComprovantes} />
      ))}
    </ul>
  );
}

function LinhaLancamento({
  l,
  acao,
  numero,
  gerenciarComprovantes = false,
}: {
  l: Lancamento;
  acao?: (l: Lancamento) => ReactNode;
  numero?: number;
  gerenciarComprovantes?: boolean;
}) {
  const entrada = l.tipo === "receita";
  // Efeito no caixa: receita soma, despesa subtrai; o estorno (valor negativo) inverte.
  const efeito = entrada ? l.valorCentavos : -l.valorCentavos;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3 last:border-0">
      <span
        className={cx(
          "grid size-[42px] shrink-0 place-items-center rounded-[13px]",
          entrada ? "bg-ok-soft text-pine" : "bg-plum-soft text-plum",
        )}
      >
        {l.estornaId ? (
          <RotateCcw aria-hidden className="size-5" />
        ) : numero !== undefined ? (
          <span className="text-[0.95rem] font-bold tabular-nums">
            <span className="sr-only">Nº </span>
            {numero}
          </span>
        ) : entrada ? (
          <ArrowDownLeft aria-hidden className="size-5" />
        ) : (
          <ArrowUpRight aria-hidden className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 font-bold leading-snug">{l.descricao}</p>
          <span className={cx("shrink-0 whitespace-nowrap font-bold tabular-nums", efeito >= 0 ? "text-pine" : "text-plum")}>
            <span className="sr-only">{efeito >= 0 ? "Entrou no caixa: " : "Saiu do caixa: "}</span>
            {efeito >= 0 ? "+ " : "− "}
            {formatarMoeda(Math.abs(l.valorCentavos))}
          </span>
        </div>
        <p className="mt-0.5 text-[0.86rem] text-muted">
          {dataISOParaBR(l.data)}
          {numero === undefined ? ` · ${l.categoriaNome}` : ""}
          {/* "Outro" não diz nada a quem lê: só mostra a forma quando ela é conhecida. */}
          {l.forma !== "outro" ? ` · ${FORMAS_PAGAMENTO[l.forma] ?? l.forma}` : ""}
          {l.criadoPorNome ? ` · lançado por ${l.criadoPorNome}` : ""}
        </p>
        <span className="sr-only">{entrada ? "Entrada de dinheiro" : "Saída de dinheiro"}</span>
        {l.estornaId || l.estornadoPor ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {l.estornaId ? <Etiqueta tom="neutro" icone={RotateCcw}>Estorno</Etiqueta> : null}
            {l.estornadoPor ? <Etiqueta tom="aviso" icone={Undo2}>Estornado</Etiqueta> : null}
          </div>
        ) : null}
        <Comprovantes l={l} gerenciar={gerenciarComprovantes} />
      </div>
      {acao ? <div className="w-full sm:w-auto">{acao(l)}</div> : null}
    </li>
  );
}

/** Comprovantes do lançamento: cada um abre o arquivo; na gestão, também anexar e remover. */
function Comprovantes({ l, gerenciar }: { l: Lancamento; gerenciar: boolean }) {
  if (!l.comprovantes.length && !gerenciar) return null;
  const varios = l.comprovantes.length > 1;
  return (
    <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
      {l.comprovantes.length ? (
        <ul aria-label="Comprovantes" className="flex flex-wrap gap-1.5">
          {l.comprovantes.map((c, i) => (
            <li key={c.id} className="inline-flex items-center rounded-full border border-line bg-surface-item">
              <a
                href={`/api/financeiro/comprovantes/${l.id}/${c.id}`}
                target="_blank"
                rel="noopener"
                title={c.nome}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[0.86rem] font-semibold text-lake underline-offset-2 hover:underline"
              >
                <Paperclip aria-hidden className="size-4 shrink-0" />
                Comprovante{varios ? ` ${i + 1}` : ""}
                <span className="font-normal whitespace-nowrap text-muted">({descreverComprovante(c)})</span>
                <span className="sr-only"> (abre em outra aba)</span>
              </a>
              {gerenciar ? <RemoverComprovante lancamentoId={l.id} comprovanteId={c.id} nome={c.nome} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {gerenciar ? <AnexarComprovante lancamentoId={l.id} quantidade={l.comprovantes.length} /> : null}
    </div>
  );
}

/**
 * Lançamentos do mês separados como no relatório em papel: receitas e cada categoria de
 * despesa (ordinárias, extraordinárias…), numerados na ordem em que foram lançados e com o
 * subtotal de cada grupo. No fim, o total geral das despesas.
 */
export function ListaAgrupada({ lancamentos, ordem }: { lancamentos: Lancamento[]; ordem?: Map<string, number> }) {
  const grupos = agruparPorCategoria(lancamentos, ordem);
  const totalDespesas = grupos.filter((g) => g.tipo === "despesa").reduce((t, g) => t + g.totalCentavos, 0);
  const gruposDespesa = grupos.filter((g) => g.tipo === "despesa").length;
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <section
          key={`${g.tipo}:${g.categoriaId}`}
          aria-label={`${g.nome}: ${g.itens.length} lançamentos, subtotal ${formatarMoeda(g.totalCentavos)}`}
          className="overflow-hidden rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card"
        >
          <header
            className={cx(
              "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3",
              g.tipo === "receita" ? "bg-ok-soft" : "bg-plum-soft",
            )}
          >
            <h3 className="font-display text-[1.05rem] font-bold">
              {g.nome}
              <span className="ml-2 text-[0.85rem] font-normal text-ink-2">
                {g.tipo === "receita" ? "entrada" : "saída"} · {g.itens.length} {g.itens.length === 1 ? "lançamento" : "lançamentos"}
              </span>
            </h3>
            <p className="font-bold tabular-nums">
              <span className="text-[0.85rem] font-normal text-ink-2">Subtotal </span>
              {formatarMoeda(g.totalCentavos)}
            </p>
          </header>
          <ul className="flex flex-col px-4 py-1">
            {g.itens.map((l, i) => (
              <LinhaLancamento key={l.id} l={l} numero={i + 1} />
            ))}
          </ul>
        </section>
      ))}
      {gruposDespesa > 1 ? (
        <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-card)] border-2 border-plum/40 bg-surface px-4 py-3 font-bold">
          <span>Total geral das despesas</span>
          <span className="tabular-nums">{formatarMoeda(totalDespesas)}</span>
        </p>
      ) : null}
    </div>
  );
}

// ---------- Quadro de casas do mês ----------

/** Quadro de casas (como no relatório em papel): só totais, nenhuma casa identificada. */
export function QuadroCasasResumo({ quadro }: { quadro: QuadroCasas }) {
  const itens = CAMPOS_QUADRO.filter((c) => quadro[c.chave] !== null);
  return (
    <div className="flex flex-col gap-3">
      {itens.length ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {itens.map((c) => (
            <div key={c.chave} className="rounded-2xl border border-borda-luz bg-surface px-3.5 py-3 shadow-card">
              <dt className="text-[0.82rem] font-bold leading-tight text-ink-2">{c.rotulo}</dt>
              <dd className="mt-1 font-display text-[1.6rem] font-bold leading-none tabular-nums">{quadro[c.chave]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {quadro.observacao ? (
        <p className="flex items-start gap-2 text-[0.92rem] text-ink-2">
          <House aria-hidden className="mt-0.5 size-4 shrink-0" />
          {quadro.observacao}
        </p>
      ) : null}
    </div>
  );
}

// ---------- Evolução mês a mês ----------

/**
 * Evolução dos últimos meses. No celular vira uma lista (sem rolar para o lado);
 * em telas maiores, tabela (boa para leitor de tela).
 */
export function TabelaEvolucao({ meses, caminho, consulta }: { meses: MesComSaldo[]; caminho: string; consulta?: string }) {
  const caixa = "rounded-[var(--radius-card)] border border-borda-luz bg-surface shadow-card";
  return (
    <>
      {/* celular */}
      <ul className={cx(caixa, "flex flex-col px-4 py-1 sm:hidden")} aria-label="Evolução financeira dos últimos meses">
        {meses.map((m) => (
          <li key={m.mes} className="border-b border-line py-3 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={linkDoMes(caminho, m.mes, consulta)}
                className="inline-flex min-h-11 items-center font-bold text-lake underline-offset-2 hover:underline"
              >
                {nomeDoMesTitulo(m.mes)}
              </Link>
              <span className={cx("font-bold tabular-nums", m.saldoFinalCentavos < 0 && "text-danger")}>
                <span className="sr-only">Saldo no fim: </span>
                {formatarMoeda(m.saldoFinalCentavos)}
              </span>
            </div>
            <p className="text-[0.86rem] text-muted tabular-nums">
              Entrou {formatarMoeda(m.receitasCentavos)} · Saiu {formatarMoeda(m.despesasCentavos)} ·{" "}
              <span className={cx("font-bold", m.resultadoCentavos < 0 ? "text-plum" : "text-pine")}>
                {m.resultadoCentavos >= 0 ? "sobrou" : "faltou"} {formatarMoeda(Math.abs(m.resultadoCentavos))}
              </span>
            </p>
          </li>
        ))}
      </ul>

      {/* telas maiores */}
      <div className={cx(caixa, "hidden overflow-hidden sm:block")}>
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Evolução financeira dos últimos meses</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="rotulo-caixa px-4 py-3">Mês</th>
              <th scope="col" className="rotulo-caixa px-3 py-3 text-right">Receitas</th>
              <th scope="col" className="rotulo-caixa px-3 py-3 text-right">Despesas</th>
              <th scope="col" className="rotulo-caixa px-3 py-3 text-right">Resultado</th>
              <th scope="col" className="rotulo-caixa px-4 py-3 text-right">Saldo no fim</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 font-bold">
                  <Link href={linkDoMes(caminho, m.mes, consulta)} className="text-lake underline-offset-2 hover:underline">
                    {nomeDoMesTitulo(m.mes)}
                  </Link>
                </th>
                <td className="px-3 py-3 text-right">{formatarMoeda(m.receitasCentavos)}</td>
                <td className="px-3 py-3 text-right">{formatarMoeda(m.despesasCentavos)}</td>
                <td className={cx("px-3 py-3 text-right font-bold", m.resultadoCentavos < 0 ? "text-plum" : "text-pine")}>
                  {m.resultadoCentavos > 0 ? "+ " : m.resultadoCentavos < 0 ? "− " : ""}
                  {formatarMoeda(Math.abs(m.resultadoCentavos))}
                </td>
                <td className={cx("px-4 py-3 text-right font-bold", m.saldoFinalCentavos < 0 && "text-danger")}>
                  {formatarMoeda(m.saldoFinalCentavos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
