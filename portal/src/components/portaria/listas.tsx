/**
 * Listas da tela da portaria (desenhadas no servidor):
 * quem está dentro, esperados hoje e encomendas aguardando (com o aviso pelo WhatsApp).
 */
import { House, LogOut, Package, UserCheck, Users } from "lucide-react";
import { registrarSaida } from "@/server/acoes/portaria";
import type { Autorizacao, ContatoDaCasa, Encomenda, EventoAcesso } from "@/server/dados/portaria";
import { EstadoVazio } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { descreverPeriodo, nomeTipoEncomenda, nomeTipoVisita } from "@/lib/portaria";
import { formatarDataHora } from "@/lib/formato";
import { EtiquetaDentro, horaDe } from "./pecas";
import { BotaoEntregar } from "./formularios-portaria";
import { AvisarWhatsApp } from "./avisar-whatsapp";

/** Item com botões embaixo (cabe na coluna estreita da seção, no celular e no computador). */
const classeItemComAcoes = "flex flex-col gap-2.5 rounded-2xl border border-line bg-surface-item p-3";
const classeAcoes = "flex flex-wrap items-start gap-2";

export function ListaDentro({
  pessoas,
  fuso,
  contatos,
  condominio,
}: {
  pessoas: EventoAcesso[];
  fuso: string;
  /** Telefones de cada casa (unitId → contatos), para o aviso "a visita está a caminho". */
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
}) {
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
        <li key={p.id} className={classeItemComAcoes}>
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
          <div className={classeAcoes}>
            <AvisarWhatsApp
              aviso={{ tipo: "visita", id: p.id }}
              contatos={contatos[p.unitId] ?? []}
              condominio={condominio}
              avisado={textoAvisado(p, fuso)}
              rotulo="Avisar: está a caminho"
            />
            <AcaoConfirmada
              acao={registrarSaida}
              campos={{ id: p.id }}
              titulo={`Registrar a saída de ${p.nome}?`}
              mensagem={`${p.unidadeRotulo} · entrou às ${horaDe(p.quando, fuso)}.`}
              textoConfirmar="Sim, saiu"
            >
              <LogOut aria-hidden className="size-4" /> Registrar saída
            </AcaoConfirmada>
          </div>
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
        <li key={a.id} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-item p-3">
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

/** Texto "avisado 21/11 14:32 por Carlos" (null = a casa ainda não foi avisada). */
export function textoAvisado(e: { avisadoEm: Date | null; avisadoPor: string }, fuso: string): string | null {
  if (!e.avisadoEm) return null;
  return `avisado ${formatarDataHora(e.avisadoEm, fuso)}${e.avisadoPor ? ` por ${e.avisadoPor.split(" ")[0]}` : ""}`;
}

export function ListaEncomendasAguardando({
  encomendas,
  fuso,
  contatos,
  condominio,
}: {
  encomendas: Encomenda[];
  fuso: string;
  /** Telefones de cada casa (unitId → contatos), para o botão do WhatsApp. */
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
}) {
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
        <li key={e.id} className={classeItemComAcoes}>
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
          <div className={classeAcoes}>
            <AvisarWhatsApp
              aviso={{ tipo: "encomenda", id: e.id, destinatario: e.destinatario, unidadeRotulo: e.unidadeRotulo, tipoEncomenda: e.tipo, observacao: e.observacao }}
              contatos={contatos[e.unitId] ?? []}
              condominio={condominio}
              avisado={textoAvisado(e, fuso)}
            />
            <BotaoEntregar id={e.id} descricao={`${nomeTipoEncomenda(e.tipo)} para ${e.destinatario} · ${e.unidadeRotulo}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
