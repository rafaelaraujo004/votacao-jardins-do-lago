import type { Metadata } from "next";
import Link from "next/link";
import { LinkVoltarFaixa } from "@/components/ui/link-voltar";
import {
  AlarmClock,
  CalendarRange,
  CalendarX2,
  ChevronRight,
  Clock,
  ListChecks,
  ShieldCheck,
  TreePalm,
  Users,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { listarAreas, minhasReservas, ocupacaoDaArea, type Reserva } from "@/server/dados/reservas";
import { areasAtivas, ocupacaoSemCasaDaArea } from "@/server/dados/morador";
import { cancelarReserva } from "@/server/acoes/reservas";
import { dataISOParaBR, hojeISO } from "@/lib/formato";
import { dataCurta } from "@/lib/agenda";
import {
  dataValida,
  REGEX_MES_RESERVA,
  avisoDesistenciaTardia,
  conferirPedido,
  contarNoDia,
  descreverFaixa,
  desistenciaForaDoPrazo,
  textoHoras,
  janelaDoMorador,
  mesAnteriorDe,
  minutosAgora,
  podeCancelarMorador,
  proximoMes,
  situacaoDasFaixas,
  type ConfigArea,
  type StatusReserva,
} from "@/lib/reservas";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { CalendarioReservas, type InfoDia } from "@/components/reservas/calendario-reservas";
import { FormularioPedido } from "@/components/reservas/formulario-pedido";
import { AvisosDaArea, EtiquetaCanceladaTarde, EtiquetaReserva, Legenda, ListaUsoLivre } from "@/components/reservas/pecas";
import { WidgetInformacoesInicio } from "@/components/informacoes/widget-inicio";

export const metadata: Metadata = { title: "Reservas" };

/** Ocupação de um horário, do jeito que a tela precisa (sem a casa de quem reservou). */
type Ocupacao = { data: string; faixaId: string; inicio: string; fim: string; status: StatusReserva; minha: boolean };

/**
 * De onde vêm os dados da agenda (sempre com login; o condomínio vem da sessão):
 * - quem pode reservar ("reservas.fazer"): áreas, ocupação, "minhas reservas" e o pedido;
 * - quem não pode: só a VISUALIZAÇÃO (áreas e horários ocupados, sem as casas dos outros).
 */
type Fonte = {
  podeReservar: boolean;
  areas: ConfigArea[];
  minhas: Reserva[];
  ocupacao: (areaId: string, mes: string) => Promise<Ocupacao[]>;
};

async function carregarFonte(ctx: Contexto, agora: Date): Promise<Fonte> {
  if (ctx.permissoes.has("reservas.fazer")) {
    const [areas, minhas] = await Promise.all([listarAreas(ctx), minhasReservas(ctx, agora)]);
    return {
      podeReservar: true,
      areas: areas.filter((a) => a.ativa),
      minhas,
      ocupacao: (areaId, mes) => ocupacaoDaArea(ctx, areaId, mes),
    };
  }
  return {
    podeReservar: false,
    areas: await areasAtivas(ctx),
    minhas: [],
    ocupacao: (areaId, mes) => ocupacaoSemCasaDaArea(ctx, areaId, mes),
  };
}

export default async function ReservasMorador({ searchParams }: PageProps<"/reservas">) {
  const ctx = await exigirPermissao("area.morador", "/reservas");
  const params = await searchParams;
  const agora = new Date();
  const fonte = await carregarFonte(ctx, agora);

  const { podeReservar, minhas } = fonte;
  const link = (areaId: string, mes: string, dia?: string) =>
    `/reservas?area=${areaId}&mes=${mes}${dia ? `&dia=${dia}` : ""}`;
  const hoje = hojeISO(agora, ctx.fuso);
  const agoraMin = minutosAgora(agora, ctx.fuso);
  const ativas = fonte.areas;
  const area = ativas.find((a) => a.id === params.area) ?? null;
  // Prazo de desistência atual de cada área (usado quando a reserva é antiga e não guardou o prazo).
  const prazos: Record<string, number> = Object.fromEntries(ativas.map((a) => [a.id, a.prazoDesistenciaHoras]));

  const cabecalho = (
    <CabecalhoPagina
      sobretitulo="Lazer"
      titulo={podeReservar ? "Reservas" : "Agenda das áreas de lazer"}
      subtitulo={
        area
          ? area.nome
          : podeReservar
            ? "Escolha a área, o dia e o horário. A administração confirma os pedidos."
            : "Veja os horários livres das áreas de lazer."
      }
    />
  );

  // Perfil sem permissão para reservar: só vê a agenda.
  const aviso = !podeReservar ? (
    <Alerta tipo="info" titulo="Seu perfil só vê a agenda">
      Para pedir reservas, fale com a administração do condomínio.
    </Alerta>
  ) : null;

  const semCasa = podeReservar && !ctx.unitId ? (
    <Alerta tipo="aviso" titulo="Seu cadastro não está ligado a uma casa">
      Para reservar, peça à administração para ligar seu cadastro à sua casa.
    </Alerta>
  ) : null;

  // ----- Sem área escolhida: cartões das áreas + minhas reservas -----
  if (!area) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        {semCasa}
        {aviso}
        {ativas.length === 0 ? (
          <EstadoVazio icone={TreePalm} titulo="Nenhuma área disponível para reserva">
            Quando a administração cadastrar as áreas de lazer, elas aparecem aqui.
          </EstadoVazio>
        ) : (
          <>
            <ListaDeAreas
              id="titulo-areas"
              titulo="Áreas de lazer"
              areas={ativas.filter((a) => a.tipo === "area")}
              href={(a) => link(a.id, hoje.slice(0, 7))}
            />
            <ListaDeAreas
              id="titulo-equipamentos"
              titulo="Equipamentos"
              areas={ativas.filter((a) => a.tipo === "equipamento")}
              href={(a) => link(a.id, hoje.slice(0, 7))}
            />
          </>
        )}
        {podeReservar ? <MinhasReservas reservas={minhas} hoje={hoje} agoraMin={agoraMin} prazos={prazos} /> : null}
        {/* Quem cuida das reservas (nome e telefone publicados pelo síndico). */}
        <WidgetInformacoesInicio ctx={ctx} mostrar={["responsavel"]} titulo="Dúvidas sobre reservas" />
      </div>
    );
  }

  // ----- Área escolhida: regras, calendário, horários do dia -----
  const janela = janelaDoMorador(area, hoje, agoraMin);
  const mesHoje = hoje.slice(0, 7);
  const ultimoMes = janela.ultimo.slice(0, 7);
  const mesPedido = typeof params.mes === "string" && REGEX_MES_RESERVA.test(params.mes) ? params.mes : mesHoje;
  const mes = mesPedido < mesHoje ? mesHoje : mesPedido > ultimoMes ? ultimoMes : mesPedido;
  const dia = typeof params.dia === "string" && dataValida(params.dia) && params.dia.startsWith(mes) ? params.dia : null;

  const ocupacao = await fonte.ocupacao(area.id, mes);
  const ocupacaoComId = ocupacao.map((o, i) => ({ ...o, id: String(i) }));

  // Quantas reservas ativas a casa já tem nesta área em cada mês (para o limite mensal).
  const usadasNoMes = (m: string) =>
    minhas.filter((r) => r.amenityId === area.id && r.mes === m && (r.status === "pendente" || r.status === "confirmada")).length;
  // Faixas livres de um dia que o morador ainda pode pedir (horário não começou, dentro da antecedência).
  const livresDe = (data: string) =>
    situacaoDasFaixas(area.faixas, ocupacaoComId.filter((o) => o.data === data)).filter(
      (s) =>
        s.estado === "livre" &&
        !conferirPedido({ area, data, faixa: s.faixa, hoje, agoraMinutos: agoraMin, reservasDaCasaNoMes: 0 }),
    );

  // Dias do calendário: fora da janela ficam desativados; lotados aparecem riscados.
  const dias: Record<string, InfoDia> = {};
  const [ano, numeroMes] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();
  for (let d = 1; d <= total; d++) {
    const data = `${mes}-${String(d).padStart(2, "0")}`;
    const ocupadosNoDia = ocupacaoComId.filter((o) => o.data === data);
    const livres = livresDe(data).length;
    const minha = ocupadosNoDia.some((o) => o.minha);
    const foraDaJanela = data < janela.primeiro || data > janela.ultimo;
    dias[data] = {
      desativado: foraDaJanela,
      lotado: !foraDaJanela && livres === 0,
      pontos: [...(minha ? ["bg-petala-roxo"] : []), ...(!foraDaJanela && livres > 0 && ocupadosNoDia.length ? ["bg-petala-amarelo"] : [])],
      descricao: foraDaJanela
        ? "fora do período de reserva"
        : `${livres === 0 ? "sem horário livre" : livres === 1 ? "1 horário livre" : `${livres} horários livres`}${minha ? ", com reserva sua" : ""}`,
    };
  }

  const situacao = dia ? situacaoDasFaixas(area.faixas, ocupacaoComId.filter((o) => o.data === dia)) : [];
  const livresDoDia = dia
    ? livresDe(dia).map((s) => ({ id: s.faixa.id, rotulo: s.faixa.rotulo, horario: descreverFaixa(s.faixa).split(" · ")[1] }))
    : [];
  // Regras que valem para o dia inteiro (antecedência, limites do mês e do dia). "24:00" = fim do dia.
  // O limite do dia conta só reservas ativas; das outras casas sabemos apenas que existem (sem saber qual casa).
  const contas = dia ? contarNoDia(ocupacao.filter((o) => o.data === dia)) : { daCasa: 0, outrasCasas: 0 };
  const problemaDoDia = dia
    ? conferirPedido({
        area,
        data: dia,
        faixa: { inicio: "24:00" },
        hoje,
        agoraMinutos: agoraMin,
        reservasDaCasaNoMes: usadasNoMes(dia.slice(0, 7)),
        reservasDaCasaNoDia: contas.daCasa,
        outrasCasasNoDia: contas.outrasCasas,
      })
    : null;
  const minhasDaArea = minhas.filter((r) => r.amenityId === area.id);

  return (
    <div className="flex flex-col gap-5">
      <LinkVoltarFaixa href="/reservas">Todas as áreas</LinkVoltarFaixa>
      {cabecalho}
      {semCasa}
      {aviso}

      <AvisosDaArea avisos={area.avisos} />
      <RegrasDaArea area={area} />

      <section aria-labelledby="titulo-calendario" className="flex flex-col gap-3">
        <TituloSecao id="titulo-calendario" extra="toque num dia">
          Escolha o dia
        </TituloSecao>
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao className="p-4">
            <CalendarioReservas
              mes={mes}
              hoje={hoje}
              selecionado={dia}
              dias={dias}
              hrefDia={(d) => link(area.id, mes, d)}
              hrefAnterior={mes > mesHoje ? link(area.id, mesAnteriorDe(mes)) : null}
              hrefProximo={mes < ultimoMes ? link(area.id, proximoMes(mes)) : null}
              rodape={
                <Legenda
                  itens={[
                    { cor: "bg-petala-roxo", texto: "Sua reserva" },
                    { cor: "bg-petala-amarelo", texto: "Alguns horários ocupados" },
                    { cor: "bg-line", texto: "Riscado: sem horário livre" },
                  ]}
                />
              }
            />
          </Cartao>

          <Cartao className="flex flex-col gap-3 p-4" aria-labelledby="titulo-dia">
            {!dia ? (
              <p id="titulo-dia" className="text-ink-2">
                Toque num dia do calendário para ver os horários. Dá para reservar de {dataISOParaBR(janela.primeiro)} a{" "}
                {dataISOParaBR(janela.ultimo)}.
              </p>
            ) : (
              <>
                <h3 id="titulo-dia" className="text-[1.1rem] font-bold text-destaque">
                  {dataCurta(dia)}/{dia.slice(0, 4)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {situacao.map(({ faixa, estado, reserva }) => (
                    <li key={faixa.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2">
                      <span>
                        <b>{faixa.rotulo}</b>{" "}
                        <span className="text-[0.88rem] text-muted">{descreverFaixa(faixa).split(" · ")[1]}</span>
                      </span>
                      {reserva?.minha ? (
                        <EtiquetaReserva status={estado} texto={estado === "pendente" ? "Seu pedido" : "Sua reserva"} />
                      ) : estado === "livre" ? (
                        <EtiquetaReserva status="livre" />
                      ) : (
                        // Para o morador, qualquer horário ocupado aparece só como "Ocupado" (sem dizer de quem).
                        <EtiquetaReserva status="bloqueada" texto="Ocupado" />
                      )}
                    </li>
                  ))}
                </ul>
                <ListaUsoLivre faixas={area.faixasLivres} />
                {!podeReservar || !ctx.unitId ? null : problemaDoDia ? (
                  <Alerta tipo="info" titulo="Não dá para reservar neste dia">
                    {problemaDoDia}
                  </Alerta>
                ) : livresDoDia.length === 0 ? (
                  <Alerta tipo="info" titulo="Nenhum horário livre neste dia">
                    Escolha outro dia no calendário.
                  </Alerta>
                ) : (
                  <FormularioPedido areaId={area.id} data={dia} faixas={livresDoDia} exigeAprovacao={area.exigeAprovacao} exigencias={area.exigencias} />
                )}
              </>
            )}
          </Cartao>
        </div>
      </section>

      {podeReservar ? (
        <MinhasReservas reservas={minhasDaArea} hoje={hoje} agoraMin={agoraMin} prazos={prazos} titulo={`Minhas reservas · ${area.nome}`} />
      ) : null}
    </div>
  );
}

/** Cartão de uma área ou equipamento na lista (leva ao calendário). */
function ListaDeAreas({
  id,
  titulo,
  areas,
  href,
}: {
  id: string;
  titulo: string;
  areas: ConfigArea[];
  href: (a: ConfigArea) => string;
}) {
  if (!areas.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <TituloSecao id={id}>{titulo}</TituloSecao>
      <ul className="grid gap-3 sm:grid-cols-2">
        {areas.map((a) => {
          const Icone = a.tipo === "equipamento" ? Wrench : TreePalm;
          return (
            <li key={a.id}>
              <Link
                href={href(a)}
                className="flex h-full min-h-11 items-center gap-3 rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card transition-shadow active:shadow-afundado"
              >
                <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-ok-soft text-pine">
                  <Icone aria-hidden className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[1.05rem] text-ink">{a.nome}</b>
                  <span className="block text-[0.88rem] text-muted">
                    {a.faixas.length === 1 ? descreverFaixa(a.faixas[0]) : `${a.faixas.length} horários por dia`}
                    {a.tipo === "area" && a.capacidade > 0 ? ` · até ${a.capacidade} pessoas` : ""}
                  </span>
                  <span className="mt-0.5 block text-[0.84rem] font-bold text-ink-2">
                    {a.exigeAprovacao ? "Precisa de aprovação" : "Confirma na hora"}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RegrasDaArea({ area }: { area: ConfigArea }) {
  const limiteDia = area.limitePorCasaPorDia;
  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <h2 className="text-[1.1rem] font-bold text-destaque">{area.tipo === "equipamento" ? "Regras do equipamento" : "Regras da área"}</h2>
      <ul className="flex flex-col gap-1.5 text-[0.95rem] text-ink-2">
        {area.tipo === "area" && area.capacidade > 0 ? (
          <li className="flex items-start gap-2">
            <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" /> Até {area.capacidade} pessoas
          </li>
        ) : null}
        <li className="flex items-start gap-2">
          {area.exigeAprovacao ? (
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
          ) : (
            <Zap aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
          )}
          {area.exigeAprovacao ? "O pedido precisa ser aprovado pela administração" : "A reserva é confirmada na hora"}
        </li>
        <li className="flex items-start gap-2">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
          {area.antecedenciaMinimaHoras === 0
            ? `Pode reservar até o horário começar, e até ${area.antecedenciaMaxDias} dias à frente`
            : `Reserve com pelo menos ${textoHoras(area.antecedenciaMinimaHoras)} de antecedência, e até ${area.antecedenciaMaxDias} dias à frente`}
        </li>
        {area.limitePorMes || limiteDia ? (
          <li className="flex items-start gap-2">
            <CalendarRange aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
            <span>
              {[
                area.limitePorMes ? `Até ${area.limitePorMes} por casa no mês` : "",
                limiteDia
                  ? `até ${limiteDia} por casa no mesmo dia${area.permitirExtraSeDiaLivre ? " (pode passar disso se nenhuma outra casa reservou o dia)" : ""}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
                .replace(/^a/, "A")}
            </span>
          </li>
        ) : null}
        {area.prazoDesistenciaHoras > 0 ? (
          <li className="flex items-start gap-2">
            <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
            Desistência sem multa até {textoHoras(area.prazoDesistenciaHoras)} antes do horário. Depois disso, fica sujeita a multa
            conforme o regimento.
          </li>
        ) : null}
      </ul>
      {area.regras ? <p className="whitespace-pre-line text-ink-2">{area.regras}</p> : null}
      {area.exigencias.length ? (
        <div className="flex flex-col gap-1.5">
          <b className="flex items-center gap-2 text-ink">
            <ListChecks aria-hidden className="size-4 text-pine" /> Exigências (você confirma ao pedir)
          </b>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-2">
            {area.exigencias.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Cartao>
  );
}

function MinhasReservas({
  reservas,
  hoje,
  agoraMin,
  prazos,
  titulo = "Minhas reservas",
}: {
  reservas: Reserva[];
  hoje: string;
  agoraMin: number;
  /** Prazo de desistência atual de cada área (para reservas antigas que não guardaram o prazo). */
  prazos: Record<string, number>;
  titulo?: string;
}) {
  return (
    <section aria-labelledby="titulo-minhas" className="flex flex-col gap-3">
      <TituloSecao id="titulo-minhas">{titulo}</TituloSecao>
      {reservas.length === 0 ? (
        <EstadoVazio icone={CalendarX2} titulo="Nenhuma reserva ainda">
          Seus pedidos e reservas aparecem aqui, com a situação de cada um.
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {reservas.map((r) => {
            const prazo = r.prazoDesistenciaHoras ?? prazos[r.amenityId] ?? 0;
            const tardia = desistenciaForaDoPrazo(r, prazo, hoje, agoraMin);
            return (
              <li key={r.id} className="saltado flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  <b className="block text-ink">{r.areaNome}</b>
                  <span className="block text-[0.9rem] text-ink-2">
                    {dataCurta(r.data)}/{r.data.slice(0, 4)} · {descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim })}
                  </span>
                  {(r.status === "recusada" || r.status === "cancelada") && r.motivo ? (
                    <span className="block text-[0.86rem] text-muted">Motivo: {r.motivo}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <EtiquetaReserva status={r.status} />
                  {r.cancelamentoTardio ? <EtiquetaCanceladaTarde /> : null}
                  {podeCancelarMorador(r, hoje, agoraMin) ? (
                    <AcaoConfirmada
                      acao={cancelarReserva}
                      campos={{ id: r.id }}
                      titulo={r.status === "pendente" ? "Cancelar este pedido?" : tardia ? "Desistir fora do prazo?" : "Cancelar esta reserva?"}
                      mensagem={
                        tardia ? (
                          <>
                            <b className="block text-danger">{avisoDesistenciaTardia(prazo)}</b>
                            {`${r.areaNome} · ${dataISOParaBR(r.data)} · ${r.faixaRotulo}. O horário fica livre para outras casas.`}
                          </>
                        ) : (
                          `${r.areaNome} · ${dataISOParaBR(r.data)} · ${r.faixaRotulo}. O horário fica livre para outras casas.`
                        )
                      }
                      textoConfirmar={tardia ? "Sim, desistir mesmo assim" : "Sim, cancelar"}
                      perigo
                    >
                      <XCircle aria-hidden className="size-4" /> Cancelar
                    </AcaoConfirmada>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
