/**
 * Listas da tela da portaria (desenhadas no servidor):
 * quem está dentro, esperados hoje, encomendas aguardando e reservas do dia.
 */
import { Ban, CalendarCheck, CalendarDays, Clock, House, LogOut, Package, UserCheck, Users } from "lucide-react";
import { registrarSaida } from "@/server/acoes/portaria";
import type { Autorizacao, Encomenda, EventoAcesso } from "@/server/dados/portaria";
import { EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { descreverPeriodo, nomeTipoEncomenda, nomeTipoVisita } from "@/lib/portaria";
import { formatarDataHora } from "@/lib/formato";
import { EtiquetaDentro, horaDe } from "./pecas";
import { BotaoEntregar } from "./formularios-portaria";

const classeItem = "flex flex-col gap-2 rounded-2xl border border-line bg-surface-clara p-3 sm:flex-row sm:items-center sm:justify-between";

export function ListaDentro({ pessoas, fuso }: { pessoas: EventoAcesso[]; fuso: string }) {
  if (!pessoas.length) {
    return (
      <EstadoVazio icone={Users} titulo="Ninguém registrado dentro">
        Quem entrar pela portaria aparece aqui até a saída.
      </EstadoVazio>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {pessoas.map((p) => (
        <li key={p.id} className={classeItem}>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{p.nome}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.92rem] text-ink-2">
              <span className="inline-flex items-center gap-1">
                <House aria-hidden className="size-4 text-pine" /> {p.unidadeRotulo}
              </span>
              <span>{nomeTipoVisita(p.tipoVisita)}</span>
              <EtiquetaDentro desde={horaDe(p.quando, fuso)} />
            </p>
          </div>
          <AcaoConfirmada
            acao={registrarSaida}
            campos={{ id: p.id }}
            titulo={`Registrar a saída de ${p.nome}?`}
            mensagem={`${p.unidadeRotulo} · entrou às ${horaDe(p.quando, fuso)}.`}
            textoConfirmar="Sim, saiu"
          >
            <LogOut aria-hidden className="size-4" /> Registrar saída
          </AcaoConfirmada>
        </li>
      ))}
    </ul>
  );
}

export function ListaEsperados({ autorizacoes }: { autorizacoes: Autorizacao[] }) {
  if (!autorizacoes.length) {
    return (
      <EstadoVazio icone={UserCheck} titulo="Ninguém esperado hoje">
        Os visitantes autorizados pelos moradores para hoje aparecem aqui.
      </EstadoVazio>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {autorizacoes.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-clara p-3">
          <p className="font-bold">{a.nome}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.92rem] text-ink-2">
            <span className="inline-flex items-center gap-1">
              <House aria-hidden className="size-4 text-pine" /> {a.unidadeRotulo}
            </span>
            <span>{nomeTipoVisita(a.tipo)}</span>
            <span>{a.usoUnico ? "Só hoje" : descreverPeriodo(a.data, a.validaAte)}</span>
          </p>
          {a.observacao ? <p className="text-[0.92rem] text-muted">{a.observacao}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function ListaEncomendasAguardando({ encomendas, fuso }: { encomendas: Encomenda[]; fuso: string }) {
  if (!encomendas.length) {
    return (
      <EstadoVazio icone={Package} titulo="Nenhuma encomenda aguardando">
        As encomendas registradas ficam aqui até alguém da casa retirar.
      </EstadoVazio>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {encomendas.map((e) => (
        <li key={e.id} className={classeItem}>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <House aria-hidden className="size-5 text-pine" /> {e.unidadeRotulo}
            </p>
            <p className="text-ink-2">
              {nomeTipoEncomenda(e.tipo)} para <b>{e.destinatario}</b>
            </p>
            <p className="text-[0.88rem] text-muted">
              Chegou {e.recebidoEm ? formatarDataHora(e.recebidoEm, fuso) : ""}
              {e.observacao ? ` · ${e.observacao}` : ""}
            </p>
          </div>
          <BotaoEntregar id={e.id} descricao={`${nomeTipoEncomenda(e.tipo)} para ${e.destinatario} · ${e.unidadeRotulo}`} />
        </li>
      ))}
    </ul>
  );
}

/** Formato que o módulo de reservas entrega para a portaria (reservasDoDia). */
export type ReservaDoDia = { id: string; areaNome: string; unidadeRotulo: string; faixaRotulo: string; status: string };

/** Situação da reserva em palavras simples. */
const SITUACAO_RESERVA: Record<string, { texto: string; tom: "ok" | "aviso" | "info"; icone: typeof Ban }> = {
  confirmada: { texto: "Confirmada", tom: "ok", icone: CalendarCheck },
  pendente: { texto: "Aguardando aprovação", tom: "aviso", icone: Clock },
  bloqueada: { texto: "Área fechada", tom: "info", icone: Ban },
};

/** `reservas = null`: não foi possível carregar (ou o perfil não vê reservas). */
export function ListaReservasHoje({ reservas }: { reservas: ReservaDoDia[] | null }) {
  if (!reservas || !reservas.length) {
    return (
      <EstadoVazio icone={CalendarDays} titulo={reservas ? "Nenhuma reserva hoje" : "Reservas indisponíveis"}>
        {reservas
          ? "As áreas de lazer reservadas para hoje aparecem aqui."
          : "Não foi possível carregar as reservas de hoje. Toque em \"Atualizar agora\" para tentar de novo."}
      </EstadoVazio>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {reservas.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-clara p-3">
          <p className="font-bold">{r.areaNome}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.92rem] text-ink-2">
            <span className="inline-flex items-center gap-1">
              <House aria-hidden className="size-4 text-pine" /> {r.unidadeRotulo}
            </span>
            <span>{r.faixaRotulo}</span>
            <Etiqueta tom={SITUACAO_RESERVA[r.status]?.tom ?? "info"} icone={SITUACAO_RESERVA[r.status]?.icone ?? CalendarDays}>
              {SITUACAO_RESERVA[r.status]?.texto ?? r.status}
            </Etiqueta>
          </p>
        </li>
      ))}
    </ul>
  );
}
