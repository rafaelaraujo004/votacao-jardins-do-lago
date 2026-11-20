import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClockOff, Ban, CalendarDays, CalendarPlus, Check, Settings2, TreePalm, X, XCircle } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import {
  cancelamentosTardios,
  listarAreas,
  numerosDaAgenda,
  pedidosPendentes,
  reservasDaAreaNoMes,
  type Reserva,
} from "@/server/dados/reservas";
import { listarUnidades } from "@/server/dados/unidades";
import { aprovarReserva, bloquearFaixa, cancelarReserva, recusarReserva, reservarParaCasa } from "@/server/acoes/reservas";
import { dataISOParaBR, formatarDataHora, hojeISO } from "@/lib/formato";
import { dataCurta } from "@/lib/agenda";
import {
  dataValida,
  REGEX_MES_RESERVA,
  descreverFaixa,
  mesAnteriorDe,
  ocupaHorario,
  proximoMes,
  reservasForaDasFaixas,
  situacaoDasFaixas,
  type ConfigArea,
} from "@/lib/reservas";
import { Alerta, Campo, Cartao, classeEntrada, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { BlocoNumero, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { CalendarioReservas, type InfoDia } from "@/components/reservas/calendario-reservas";
import { DialogoFormulario } from "@/components/reservas/dialogo-formulario";
import { COR_PONTO, EtiquetaCanceladaTarde, EtiquetaReserva, Legenda, ListaUsoLivre } from "@/components/reservas/pecas";

export const metadata: Metadata = { title: "Reservas e áreas" };

/** Link da agenda mantendo área, mês e dia. */
function link(area: string, mes: string, dia?: string) {
  return `/admin/reservas?area=${area}&mes=${mes}${dia ? `&dia=${dia}` : ""}`;
}

/** Filtro "Cancelada fora do prazo" (desistências tardias dos moradores). */
const LINK_FORA_DO_PRAZO = "/admin/reservas?ver=fora-do-prazo";

export default async function AgendaReservas({ searchParams }: PageProps<"/admin/reservas">) {
  const ctx = await exigirPermissao("reservas.ver_todas");
  const podeGerenciar = ctx.permissoes.has("reservas.gerenciar");
  const podeConfigurar = ctx.permissoes.has("areas.configurar");
  const hoje = hojeISO(new Date(), ctx.fuso);

  const [areas, numeros, pendentes, tardios, unidades] = await Promise.all([
    listarAreas(ctx),
    numerosDaAgenda(ctx),
    pedidosPendentes(ctx),
    cancelamentosTardios(ctx),
    podeGerenciar && ctx.permissoes.has("unidades.ver") ? listarUnidades(ctx) : Promise.resolve([]),
  ]);

  const titulo = (
    <TituloPagina
      sobretitulo="Serviços"
      titulo="Reservas e áreas"
      descricao="A agenda das áreas de lazer é controlada pela administração. Pedidos dos moradores aparecem aqui para aprovar."
      acoes={
        podeConfigurar ? (
          <BotaoLink href="/admin/reservas/areas" variante="secundario" icone={<Settings2 aria-hidden className="size-5" />}>
            Configurar áreas
          </BotaoLink>
        ) : null
      }
    />
  );

  if (areas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {titulo}
        <EstadoVazio
          icone={TreePalm}
          titulo="Nenhuma área de lazer cadastrada"
          acao={podeConfigurar ? <BotaoLink href="/admin/reservas/areas">Cadastrar áreas</BotaoLink> : null}
        >
          Cadastre o salão de festas, a churrasqueira e a quadra para começar a usar a agenda.
        </EstadoVazio>
      </div>
    );
  }

  // Filtros do endereço: área, mês e dia (sempre conferidos).
  const params = await searchParams;
  const verForaDoPrazo = params.ver === "fora-do-prazo";
  const filtro = (
    <SegmentoLinks
      rotulo="O que mostrar"
      ariaCurrent="page"
      opcoes={[
        { rotulo: "Agenda", href: "/admin/reservas", ativo: !verForaDoPrazo },
        { rotulo: `Canceladas fora do prazo (${tardios.length})`, href: LINK_FORA_DO_PRAZO, ativo: verForaDoPrazo },
      ]}
    />
  );

  if (verForaDoPrazo) {
    return (
      <div className="flex flex-col gap-6">
        {titulo}
        {filtro}
        <section aria-labelledby="titulo-tardios" className="flex flex-col gap-3">
          <TituloSecao id="titulo-tardios" extra={`${tardios.length} ${tardios.length === 1 ? "registro" : "registros"}`}>
            Canceladas fora do prazo
          </TituloSecao>
          <p className="text-ink-2">
            Moradores que desistiram de uma reserva confirmada faltando menos que o prazo de desistência da área. A multa, se houver, segue o
            regimento: o portal só registra.
          </p>
          {tardios.length === 0 ? (
            <EstadoVazio icone={AlarmClockOff} titulo="Nenhuma desistência fora do prazo">
              Quando um morador desistir depois do prazo, a reserva aparece aqui.
            </EstadoVazio>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {tardios.map((r) => (
                <li key={r.id} className="saltado flex flex-col gap-2 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-ink">
                      {r.areaNome} · {r.unidadeRotulo ?? "—"}
                    </b>
                    <EtiquetaCanceladaTarde />
                  </div>
                  <span className="text-[0.92rem] text-ink-2">
                    {dataISOParaBR(r.data)} · {descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim })}
                  </span>
                  <span className="text-[0.88rem] text-muted">
                    {r.canceladoEm ? `Cancelada em ${formatarDataHora(r.canceladoEm, ctx.fuso)}` : "Cancelada"}
                    {r.prazoDesistenciaHoras ? ` · prazo da área: ${r.prazoDesistenciaHoras} horas` : ""}
                    {r.decididoPorNome ? ` · por ${r.decididoPorNome}` : ""}
                  </span>
                  <Link
                    href={link(r.amenityId, r.data.slice(0, 7), r.data)}
                    className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[0.9rem] font-bold text-lake"
                  >
                    <CalendarDays aria-hidden className="size-4" /> Ver no calendário
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const area: ConfigArea = areas.find((a) => a.id === params.area) ?? areas[0];
  const mesHoje = hoje.slice(0, 7);
  const mes = typeof params.mes === "string" && REGEX_MES_RESERVA.test(params.mes) ? params.mes : mesHoje;
  const dia =
    typeof params.dia === "string" && dataValida(params.dia) && params.dia.startsWith(mes)
      ? params.dia
      : mes === mesHoje
        ? hoje
        : `${mes}-01`;

  const reservasMes = await reservasDaAreaNoMes(ctx, area.id, mes);
  const doDia = reservasMes.filter((r) => r.data === dia);
  const situacao = situacaoDasFaixas(area.faixas, doDia);
  const foraDasFaixas = reservasForaDasFaixas(area.faixas, doDia);
  const historicoDoDia = doDia.filter((r) => !ocupaHorario(r.status));
  const unidadesAtivas = unidades.filter((u) => u.status === "ativa").map((u) => ({ id: u.id, rotulo: u.rotulo }));

  // Pontinhos do calendário: uma cor por situação presente no dia.
  const dias: Record<string, InfoDia> = {};
  for (const r of reservasMes) {
    if (!ocupaHorario(r.status)) continue;
    const info = (dias[r.data] ??= { pontos: [], descricao: "" });
    const cor = COR_PONTO[r.status as keyof typeof COR_PONTO];
    if (!info.pontos!.includes(cor)) info.pontos!.push(cor);
  }
  for (const [data, info] of Object.entries(dias)) {
    const n = reservasMes.filter((r) => r.data === data && ocupaHorario(r.status)).length;
    info.descricao = n === 1 ? "1 horário ocupado" : `${n} horários ocupados`;
  }

  return (
    <div className="flex flex-col gap-6">
      {titulo}
      {filtro}

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero rotulo="Pendentes" valor={numeros.pendentes} detalhe="aguardando você" cor={numeros.pendentes ? "laranja" : "ink"} />
        <BlocoNumero rotulo="Hoje" valor={numeros.hoje} detalhe="reservas" cor="pine" />
        <BlocoNumero rotulo="Esta semana" valor={numeros.semana} detalhe="próximos 7 dias" cor="lake" />
      </div>

      {pendentes.length ? (
        <section aria-labelledby="titulo-pendentes" className="flex flex-col gap-3">
          {/* Os pedidos das áreas de quem está vendo vêm primeiro. */}
          <TituloSecao id="titulo-pendentes" extra={`${pendentes.length} ${pendentes.length === 1 ? "pedido" : "pedidos"}`}>
            Pedidos aguardando aprovação
          </TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {ordenarPorResponsavel(pendentes, areas, ctx.uid).map((r) => (
              <li key={r.id} className="saltado flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <b className="block text-ink">
                    {r.areaNome} · {r.unidadeRotulo ?? "—"}
                  </b>
                  <span className="block text-[0.92rem] text-ink-2">
                    {dataCurta(r.data)}/{r.data.slice(0, 4)} · {descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim })}
                  </span>
                  {r.observacao ? <span className="block text-[0.88rem] text-muted">“{r.observacao}”</span> : null}
                  <QuemAprova area={areas.find((a) => a.id === r.amenityId)} uid={ctx.uid} />
                  <Link href={link(r.amenityId, r.data.slice(0, 7), r.data)} scroll={false} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-[0.9rem] font-bold text-lake">
                    <CalendarDays aria-hidden className="size-4" /> Ver no calendário
                  </Link>
                </div>
                {podeGerenciar ? <BotoesDecisao reserva={r} hoje={hoje} /> : <EtiquetaReserva status="pendente" />}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="titulo-agenda" className="flex flex-col gap-3">
        <TituloSecao id="titulo-agenda">Agenda</TituloSecao>
        <SegmentoLinks
          rotulo="Escolha a área"
          rolavel
          ariaCurrent="page"
          opcoes={areas.map((a) => ({
            rotulo: `${a.nome}${a.tipo === "equipamento" ? " (equipamento)" : ""}${a.ativa ? "" : " (inativa)"}`,
            href: link(a.id, mes),
            ativo: a.id === area.id,
          }))}
        />
        {!area.ativa ? (
          <Alerta tipo="aviso" titulo="Área inativa">
            Os moradores não veem esta área. A administração ainda pode consultar o histórico.
          </Alerta>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Cartao className="p-4">
            <CalendarioReservas
              mes={mes}
              hoje={hoje}
              selecionado={dia}
              dias={dias}
              hrefDia={(d) => link(area.id, mes, d)}
              hrefAnterior={link(area.id, mesAnteriorDe(mes))}
              hrefProximo={link(area.id, proximoMes(mes))}
              rodape={
                <Legenda
                  itens={[
                    { cor: COR_PONTO.confirmada, texto: "Confirmada" },
                    { cor: COR_PONTO.pendente, texto: "Aguardando aprovação" },
                    { cor: COR_PONTO.bloqueada, texto: "Bloqueada" },
                  ]}
                />
              }
            />
          </Cartao>

          <Cartao className="flex flex-col gap-3 p-4" aria-labelledby="titulo-dia">
            <h3 id="titulo-dia" className="text-[1.1rem] font-bold text-destaque">
              {dataCurta(dia)}/{dia.slice(0, 4)} · {area.nome}
            </h3>
            {dia < hoje ? <p className="text-[0.9rem] text-muted">Dia que já passou: só consulta.</p> : null}
            <ul className="flex flex-col gap-2.5">
              {situacao.map(({ faixa, estado, reserva }) => (
                <li key={faixa.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <b className="block">{faixa.rotulo}</b>
                      <span className="text-[0.88rem] text-muted">{descreverFaixa(faixa).split(" · ")[1]}</span>
                    </span>
                    <EtiquetaReserva status={estado} />
                  </div>
                  {reserva ? <DetalheReserva reserva={reserva} /> : null}
                  {podeGerenciar && dia >= hoje ? (
                    <div className="flex flex-wrap gap-2">
                      {estado === "livre" ? (
                        <>
                          <DialogoFormulario
                            acao={reservarParaCasa}
                            campos={{ areaId: area.id, data: dia, faixaId: faixa.id }}
                            rotuloBotao="Reservar para uma casa"
                            icone={<CalendarPlus aria-hidden className="size-4" />}
                            titulo="Reservar para uma casa"
                            descricao={`${area.nome} · ${dataISOParaBR(dia)} · ${descreverFaixa(faixa)}. A reserva já fica confirmada.`}
                            textoEnviar="Confirmar reserva"
                          >
                            <Campo id={`casa-${faixa.id}`} rotulo="Casa">
                              <select id={`casa-${faixa.id}`} name="unitId" required defaultValue="" className={classeEntrada}>
                                <option value="" disabled>
                                  Escolha a casa
                                </option>
                                {unidadesAtivas.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.rotulo}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                            <Campo id={`obs-${faixa.id}`} rotulo="Observação (opcional)">
                              <input id={`obs-${faixa.id}`} name="observacao" maxLength={300} className={classeEntrada} placeholder="Ex.: pedido feito por telefone" />
                            </Campo>
                          </DialogoFormulario>
                          <DialogoFormulario
                            acao={bloquearFaixa}
                            campos={{ areaId: area.id, data: dia, faixaId: faixa.id }}
                            rotuloBotao="Bloquear"
                            icone={<Ban aria-hidden className="size-4" />}
                            titulo="Bloquear este horário?"
                            descricao={`${area.nome} · ${dataISOParaBR(dia)} · ${descreverFaixa(faixa)}. Ninguém poderá reservar enquanto estiver bloqueado.`}
                            textoEnviar="Bloquear horário"
                          >
                            <Campo id={`motivo-b-${faixa.id}`} rotulo="Motivo">
                              <input id={`motivo-b-${faixa.id}`} name="motivo" required minLength={3} maxLength={200} className={classeEntrada} placeholder="Ex.: manutenção, evento do condomínio" />
                            </Campo>
                          </DialogoFormulario>
                        </>
                      ) : reserva && estado === "pendente" ? (
                        <BotoesDecisao reserva={reserva} hoje={hoje} />
                      ) : reserva ? (
                        <BotaoCancelar reserva={reserva} />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <ListaUsoLivre faixas={area.faixasLivres} />

            {foraDasFaixas.length ? (
              <div className="flex flex-col gap-2">
                <h4 className="font-bold">Em horários que mudaram depois</h4>
                {foraDasFaixas.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>{descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim })}</b>
                      <EtiquetaReserva status={r.status} />
                    </div>
                    <DetalheReserva reserva={r} />
                    {podeGerenciar && dia >= hoje ? <BotaoCancelar reserva={r} /> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {historicoDoDia.length ? (
              <details className="rounded-2xl border border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 font-bold">
                  <XCircle aria-hidden className="size-4 text-muted" /> Recusadas e canceladas neste dia ({historicoDoDia.length})
                </summary>
                <ul className="flex flex-col gap-2 border-t border-line p-3">
                  {historicoDoDia.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <b>{r.faixaRotulo}</b>
                        <EtiquetaReserva status={r.status} />
                        {r.cancelamentoTardio ? <EtiquetaCanceladaTarde /> : null}
                      </span>
                      <DetalheReserva reserva={r} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Cartao>
        </div>
      </section>
    </div>
  );
}

/** Casa, observação, motivo e quem fez (só a gestão vê esta tela). */
function DetalheReserva({ reserva: r }: { reserva: Reserva }) {
  return (
    <div className="text-[0.9rem] text-ink-2">
      {r.status === "bloqueada" ? (
        <p>
          <b>Bloqueio:</b> {r.motivo || "uso do condomínio"}
        </p>
      ) : (
        <p>
          <b>{r.unidadeRotulo ?? "—"}</b> · {r.origem === "morador" ? "pedido do morador" : "feita pela administração"}
          {r.criadoPorNome ? ` (${r.criadoPorNome})` : ""}
        </p>
      )}
      {r.observacao ? <p className="text-muted">“{r.observacao}”</p> : null}
      {r.aceitouRegrasEm ? <p className="text-muted">Aceitou as regras da área ao pedir.</p> : null}
      {(r.status === "recusada" || r.status === "cancelada") && r.motivo ? (
        <p className="text-muted">
          Motivo: {r.motivo}
          {r.decididoPorNome ? ` — ${r.decididoPorNome}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function BotoesDecisao({ reserva: r, hoje }: { reserva: Reserva; hoje: string }) {
  const resumo = `${r.areaNome} · ${r.unidadeRotulo ?? ""} · ${dataISOParaBR(r.data)} · ${r.faixaRotulo}`;
  return (
    <div className="flex flex-wrap gap-2">
      {r.data >= hoje ? (
        <AcaoConfirmada
          acao={aprovarReserva}
          campos={{ id: r.id }}
          titulo="Aprovar este pedido?"
          mensagem={`${resumo}. A reserva fica confirmada e o morador vê a mudança no portal.`}
          textoConfirmar="Sim, aprovar"
          variante="primario"
        >
          <Check aria-hidden className="size-4" /> Aprovar
        </AcaoConfirmada>
      ) : null}
      <DialogoFormulario
        acao={recusarReserva}
        campos={{ id: r.id }}
        rotuloBotao="Recusar"
        icone={<X aria-hidden className="size-4" />}
        titulo="Recusar este pedido?"
        descricao={`${resumo}. O horário volta a ficar livre. O morador vê o motivo.`}
        textoEnviar="Recusar pedido"
        varianteEnviar="perigo"
      >
        <Campo id={`motivo-r-${r.id}`} rotulo="Comentário para o morador (motivo da recusa)">
          <input id={`motivo-r-${r.id}`} name="motivo" required minLength={3} maxLength={200} className={classeEntrada} placeholder="Ex.: data reservada para evento do condomínio" />
        </Campo>
      </DialogoFormulario>
    </div>
  );
}

function BotaoCancelar({ reserva: r }: { reserva: Reserva }) {
  const bloqueio = r.status === "bloqueada";
  return (
    <DialogoFormulario
      acao={cancelarReserva}
      campos={{ id: r.id }}
      rotuloBotao={bloqueio ? "Desbloquear" : "Cancelar"}
      icone={<XCircle aria-hidden className="size-4" />}
      titulo={bloqueio ? "Desbloquear este horário?" : "Cancelar esta reserva?"}
      descricao={`${r.areaNome} · ${r.unidadeRotulo ?? "bloqueio"} · ${dataISOParaBR(r.data)} · ${r.faixaRotulo}. O horário volta a ficar livre e o registro continua no histórico.`}
      textoEnviar={bloqueio ? "Desbloquear" : "Cancelar reserva"}
      varianteEnviar="perigo"
    >
      <Campo id={`motivo-c-${r.id}`} rotulo="Motivo">
        <input id={`motivo-c-${r.id}`} name="motivo" required minLength={3} maxLength={200} className={classeEntrada} placeholder={bloqueio ? "Ex.: manutenção concluída" : "Ex.: pedido do morador"} />
      </Campo>
    </DialogoFormulario>
  );
}

/** Pedidos das áreas em que a pessoa é responsável primeiro (a ordem de data continua dentro de cada grupo). */
function ordenarPorResponsavel(pendentes: Reserva[], areas: ConfigArea[], uid: string): Reserva[] {
  const minhas = new Set(areas.filter((a) => a.responsavelUid === uid).map((a) => a.id));
  return [...pendentes].sort((a, b) => Number(minhas.has(b.amenityId)) - Number(minhas.has(a.amenityId)));
}

/** "Quem aprova: Shirley (você)" — o responsável escolhido na configuração da área, ou o síndico. */
function QuemAprova({ area, uid }: { area: ConfigArea | undefined; uid: string }) {
  const minha = !!area?.responsavelUid && area.responsavelUid === uid;
  return (
    <span className="block text-[0.86rem] text-muted">
      Quem aprova: <b className="text-ink-2">{area?.responsavelUid ? area.responsavelNome || "responsável da área" : "Síndico / Administração"}</b>
      {minha ? " (você)" : ""}
    </span>
  );
}
