import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarX2, ChevronRight, Clock, LogIn, ShieldCheck, TreePalm, Users, XCircle, Zap } from "lucide-react";
import { exigirContexto } from "@/server/contexto";
import { sessaoOpcional } from "@/server/sessao-opcional";
import { comC, condominioPublico, sufixoC } from "@/server/publico";
import { listarAreas, minhasReservas, ocupacaoDaArea, type Reserva } from "@/server/dados/reservas";
import { areasPublicas, ocupacaoPublicaDaArea } from "@/server/dados/publico";
import { linkEntrar } from "@/lib/destino-seguro";
import { PortalIndisponivel } from "@/components/layout/faixa-topo";
import { BotaoLink } from "@/components/ui/botao";
import { cancelarReserva } from "@/server/acoes/reservas";
import { dataISOParaBR, hojeISO } from "@/lib/formato";
import { dataCurta } from "@/lib/agenda";
import {
  dataValida,
  REGEX_MES_RESERVA,
  conferirPedido,
  descreverFaixa,
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
import { EtiquetaReserva, Legenda } from "@/components/reservas/pecas";

export const metadata: Metadata = { title: "Reservas" };

/** Ocupação de um horário, do jeito que a tela precisa (sem a casa de quem reservou). */
type Ocupacao = { data: string; faixaId: string; inicio: string; fim: string; status: StatusReserva; minha: boolean };

/**
 * De onde vêm os dados da agenda:
 * - morador LOGADO (com "reservas.fazer"): áreas, ocupação, "minhas reservas" e o pedido;
 * - qualquer outra pessoa: só a VISUALIZAÇÃO pública (áreas e horários ocupados, sem casas).
 */
type Fonte = {
  logado: boolean;
  fuso: string;
  unitId: string | null;
  areas: ConfigArea[];
  minhas: Reserva[];
  ocupacao: (areaId: string, mes: string) => Promise<Ocupacao[]>;
  /** "" ou "?c=<id>" para manter o condomínio nos links. */
  sufixo: string;
};

async function carregarFonte(c: string | string[] | undefined, agora: Date): Promise<Fonte | null> {
  const sessao = await sessaoOpcional();
  if (sessao?.permissoes.has("reservas.fazer")) {
    // Mesmas regras de sempre (ex.: senha provisória → troca de senha).
    const ctx = await exigirContexto();
    const [areas, minhas, cp] = await Promise.all([listarAreas(ctx), minhasReservas(ctx, agora), condominioPublico(c)]);
    return {
      logado: true,
      fuso: ctx.fuso,
      unitId: ctx.unitId,
      areas: areas.filter((a) => a.ativa),
      minhas,
      ocupacao: (areaId, mes) => ocupacaoDaArea(ctx, areaId, mes),
      sufixo: cp && cp.id === ctx.condominioId ? sufixoC(cp) : "",
    };
  }
  const cp = await condominioPublico(c);
  if (!cp) return null;
  return {
    logado: false,
    fuso: cp.fuso,
    unitId: null,
    areas: await areasPublicas(cp),
    minhas: [],
    ocupacao: (areaId, mes) => ocupacaoPublicaDaArea(cp, areaId, mes),
    sufixo: sufixoC(cp),
  };
}

export default async function ReservasMorador({ searchParams }: PageProps<"/reservas">) {
  const params = await searchParams;
  const agora = new Date();
  const fonte = await carregarFonte(params.c, agora);
  if (!fonte) return <PortalIndisponivel />;

  const { logado, sufixo, minhas } = fonte;
  const link = (areaId: string, mes: string, dia?: string) =>
    comC(`/reservas?area=${areaId}&mes=${mes}${dia ? `&dia=${dia}` : ""}`, sufixo);
  const hoje = hojeISO(agora, fonte.fuso);
  const agoraMin = minutosAgora(agora, fonte.fuso);
  const ativas = fonte.areas;
  const area = ativas.find((a) => a.id === params.area) ?? null;
  const c = Array.isArray(params.c) ? params.c[0] : params.c;

  const cabecalho = (
    <CabecalhoPagina
      sobretitulo="Lazer"
      titulo={logado ? "Reservas" : "Agenda das áreas de lazer"}
      subtitulo={
        area
          ? area.nome
          : logado
            ? "Escolha a área, o dia e o horário. A administração confirma os pedidos."
            : "Veja os horários livres. Para pedir uma reserva, entre com o usuário da sua casa."
      }
    />
  );

  // Sem login: convite para entrar (depois volta para esta mesma tela).
  const convite = !logado ? (
    <Cartao className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-ink-2">Para pedir uma reserva e acompanhar as da sua casa, entre com o seu usuário e senha.</p>
      <BotaoLink href={linkEntrar(area ? `/reservas?area=${area.id}` : "/reservas", c)} icone={<LogIn aria-hidden className="size-5" />}>
        Entrar para pedir reserva
      </BotaoLink>
    </Cartao>
  ) : null;

  const semCasa = logado && !fonte.unitId ? (
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
        {convite}
        {ativas.length === 0 ? (
          <EstadoVazio icone={TreePalm} titulo="Nenhuma área disponível para reserva">
            Quando a administração cadastrar as áreas de lazer, elas aparecem aqui.
          </EstadoVazio>
        ) : (
          <section aria-labelledby="titulo-areas" className="flex flex-col gap-3">
            <TituloSecao id="titulo-areas">Escolha a área</TituloSecao>
            <ul className="grid gap-3 sm:grid-cols-2">
              {ativas.map((a) => (
                <li key={a.id}>
                  <Link
                    href={link(a.id, hoje.slice(0, 7))}
                    className="flex h-full items-center gap-3 rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card transition-shadow active:shadow-afundado"
                  >
                    <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-ok-soft text-pine">
                      <TreePalm aria-hidden className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[1.05rem] text-ink">{a.nome}</b>
                      <span className="block text-[0.88rem] text-muted">
                        {a.faixas.length === 1 ? descreverFaixa(a.faixas[0]) : `${a.faixas.length} horários por dia`} · até {a.capacidade} pessoas
                      </span>
                      <span className="mt-0.5 block text-[0.84rem] font-bold text-ink-2">
                        {a.exigeAprovacao ? "Precisa de aprovação" : "Confirma na hora"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-pine" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {logado ? <MinhasReservas reservas={minhas} hoje={hoje} agoraMin={agoraMin} /> : null}
      </div>
    );
  }

  // ----- Área escolhida: regras, calendário, horários do dia -----
  const janela = janelaDoMorador(area, hoje);
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
  // Regras que valem para o dia inteiro (antecedência, limite do mês). "24:00" = ignora o horário.
  const problemaDoDia = dia
    ? conferirPedido({ area, data: dia, faixa: { inicio: "24:00" }, hoje, agoraMinutos: agoraMin, reservasDaCasaNoMes: usadasNoMes(dia.slice(0, 7)) })
    : null;
  const minhasDaArea = minhas.filter((r) => r.amenityId === area.id);

  return (
    <div className="flex flex-col gap-5">
      <Link href={comC("/reservas", sufixo)} className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Todas as áreas
      </Link>
      {cabecalho}
      {semCasa}
      {convite}

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
                {!logado ? (
                  livresDoDia.length > 0 ? (
                    <BotaoLink
                      href={linkEntrar(`/reservas?area=${area.id}&mes=${mes}&dia=${dia}`, c)}
                      icone={<LogIn aria-hidden className="size-5" />}
                    >
                      Entrar para pedir reserva
                    </BotaoLink>
                  ) : null
                ) : !fonte.unitId ? null : problemaDoDia ? (
                  <Alerta tipo="info" titulo="Não dá para reservar neste dia">
                    {problemaDoDia}
                  </Alerta>
                ) : livresDoDia.length === 0 ? (
                  <Alerta tipo="info" titulo="Nenhum horário livre neste dia">
                    Escolha outro dia no calendário.
                  </Alerta>
                ) : (
                  <FormularioPedido areaId={area.id} data={dia} faixas={livresDoDia} exigeAprovacao={area.exigeAprovacao} />
                )}
              </>
            )}
          </Cartao>
        </div>
      </section>

      {logado ? (
        <MinhasReservas reservas={minhasDaArea} hoje={hoje} agoraMin={agoraMin} titulo={`Minhas reservas · ${area.nome}`} />
      ) : null}
    </div>
  );
}

function RegrasDaArea({ area }: { area: ConfigArea }) {
  return (
    <Cartao className="flex flex-col gap-3 p-4">
      <h2 className="text-[1.1rem] font-bold text-destaque">Regras da área</h2>
      <ul className="flex flex-col gap-1.5 text-[0.95rem] text-ink-2">
        <li className="flex items-start gap-2">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" /> Até {area.capacidade} pessoas
        </li>
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
          {area.antecedenciaMinDias === 0
            ? `Pode reservar para hoje e até ${area.antecedenciaMaxDias} dias à frente`
            : `Reserve com ${area.antecedenciaMinDias} a ${area.antecedenciaMaxDias} dias de antecedência`}
          {area.limitePorMes ? ` · até ${area.limitePorMes} por casa no mês` : ""}
        </li>
      </ul>
      {area.regras ? <p className="whitespace-pre-line text-ink-2">{area.regras}</p> : null}
    </Cartao>
  );
}

function MinhasReservas({
  reservas,
  hoje,
  agoraMin,
  titulo = "Minhas reservas",
}: {
  reservas: Reserva[];
  hoje: string;
  agoraMin: number;
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
          {reservas.map((r) => (
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
                {podeCancelarMorador(r, hoje, agoraMin) ? (
                  <AcaoConfirmada
                    acao={cancelarReserva}
                    campos={{ id: r.id }}
                    titulo={r.status === "pendente" ? "Cancelar este pedido?" : "Cancelar esta reserva?"}
                    mensagem={`${r.areaNome} · ${dataISOParaBR(r.data)} · ${r.faixaRotulo}. O horário fica livre para outras casas.`}
                    textoConfirmar="Sim, cancelar"
                    perigo
                  >
                    <XCircle aria-hidden className="size-4" /> Cancelar
                  </AcaoConfirmada>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
