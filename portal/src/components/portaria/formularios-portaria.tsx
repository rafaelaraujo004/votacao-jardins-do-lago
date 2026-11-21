"use client";

/**
 * Formulários rápidos da portaria: visitante sem código, nova encomenda
 * e o botão "Entregar" (pede quem retirou e a confirmação).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, PackageCheck, PackagePlus, PhoneCall } from "lucide-react";
import { entregarEncomenda, registrarEncomenda, registrarEntradaSemCodigo } from "@/server/acoes/portaria";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { TIPOS_ENCOMENDA, TIPOS_VISITA, nomeTipoEncomenda, type CasaParaBusca } from "@/lib/portaria";
import type { ContatoDaCasa, Encomenda } from "@/server/dados/portaria";
import { AvisarWhatsApp } from "./avisar-whatsapp";
import { AvisoDepoisDaEntrada, acharEntrada, type EntradaDentro, type EntradaProcurada } from "./aviso-entrada";
import { OpcoesPilula } from "./pecas";
import { SeletorCasa } from "./seletor-casa";

const classeCaixa =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-3 font-bold has-checked:border-pine has-checked:bg-ok-soft " +
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake";

export function EntradaSemCodigo({
  casas,
  dentro,
  contatos,
  condominio,
}: {
  casas: CasaParaBusca[];
  /** Quem está dentro (para achar a entrada que acabou de ser registrada e oferecer o aviso). */
  dentro: EntradaDentro[];
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
}) {
  const router = useRouter();
  const enviado = useRef<EntradaProcurada | null>(null);
  const [procurada, setProcurada] = useState<EntradaProcurada | null>(null);
  const recente = acharEntrada(dentro, procurada);
  return (
    <div
      className="flex flex-col gap-4"
      onSubmitCapture={(ev) => {
        const dados = new FormData(ev.target as HTMLFormElement);
        enviado.current = { nome: String(dados.get("nome") ?? ""), unitId: String(dados.get("unitId") ?? "") };
      }}
    >
      {recente ? <AvisoDepoisDaEntrada entrada={recente} contatos={contatos} condominio={condominio} aoFechar={() => setProcurada(null)} /> : null}
    <Formulario
      acao={registrarEntradaSemCodigo}
      aoSalvar={() => {
        setProcurada(enviado.current);
        router.refresh();
      }}
    >
      <SeletorCasa casas={casas} id="casa-sem-codigo" rotulo="Casa que vai receber" />
      <Campo id="nome-sem-codigo" rotulo="Nome do visitante">
        <input id="nome-sem-codigo" name="nome" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
      </Campo>
      <OpcoesPilula nome="tipo" legenda="Tipo" padrao="visita" opcoes={Object.entries(TIPOS_VISITA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <label className={classeCaixa}>
        <input type="checkbox" name="confirmado" required className="mt-1 size-5 shrink-0 accent-[var(--pine)]" />
        <span className="flex items-start gap-2">
          <PhoneCall aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" />
          Confirmei com o morador por telefone que a entrada está liberada.
        </span>
      </label>
      <div>
        <BotaoEnviar textoEnviando="Registrando…">
          <DoorOpen aria-hidden className="size-5" /> Registrar entrada
        </BotaoEnviar>
      </div>
    </Formulario>
    </div>
  );
}

export function NovaEncomenda({
  casas,
  encomendas,
  contatos,
  condominio,
}: {
  casas: CasaParaBusca[];
  /** Encomendas aguardando (para achar a que acabou de ser registrada e oferecer o aviso). */
  encomendas: Encomenda[];
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
}) {
  const router = useRouter();
  // O que foi enviado no último registro (lido na hora de enviar, antes de o formulário limpar).
  const enviado = useRef<{ unitId: string; destinatario: string } | null>(null);
  const [registrada, setRegistrada] = useState<{ unitId: string; destinatario: string } | null>(null);
  // A encomenda que acabou de ser registrada (a mais nova da casa com o mesmo nome).
  const recente = registrada
    ? encomendas
        .filter((e) => e.unitId === registrada.unitId && e.destinatario === registrada.destinatario)
        .sort((a, b) => (b.recebidoEm?.getTime() ?? 0) - (a.recebidoEm?.getTime() ?? 0))[0]
    : undefined;
  return (
    <div
      className="flex flex-col gap-4"
      onSubmitCapture={(ev) => {
        const form = ev.target as HTMLFormElement;
        const dados = new FormData(form);
        enviado.current = {
          unitId: String(dados.get("unitId") ?? ""),
          destinatario: String(dados.get("destinatario") ?? "").trim().replace(/\s+/g, " "),
        };
      }}
    >
      {recente ? (
        <div role="status" className="flex flex-col gap-2.5 rounded-2xl border-2 border-pine bg-ok-soft p-3.5">
          <p className="flex items-center gap-2 font-bold text-pine">
            <PackageCheck aria-hidden className="size-5" /> Registrada: {nomeTipoEncomenda(recente.tipo)} para {recente.destinatario} ({recente.unidadeRotulo})
          </p>
          <p className="text-[0.92rem] text-ink-2">Agora avise a casa pelo WhatsApp:</p>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <AvisarWhatsApp
              grande
              aviso={{ tipo: "encomenda", id: recente.id, destinatario: recente.destinatario, unidadeRotulo: recente.unidadeRotulo, tipoEncomenda: recente.tipo, observacao: recente.observacao }}
              contatos={contatos[recente.unitId] ?? []}
              condominio={condominio}
              avisado={null}
            />
            <button type="button" onClick={() => setRegistrada(null)} className="min-h-11 rounded-full px-3 text-[0.9rem] font-bold text-lake hover:shadow-afundado">
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    <Formulario
      acao={registrarEncomenda}
      aoSalvar={() => {
        setRegistrada(enviado.current);
        router.refresh();
      }}
    >
      <SeletorCasa casas={casas} id="casa-encomenda" />
      <Campo id="destinatario" rotulo="Para quem (nome na etiqueta)">
        <input id="destinatario" name="destinatario" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
      </Campo>
      <OpcoesPilula nome="tipo" legenda="Tipo" padrao="caixa" opcoes={Object.entries(TIPOS_ENCOMENDA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <Campo id="observacao-encomenda" rotulo="Observação (opcional)" dica="Ex.: Correios, caixa grande, frágil.">
        <input id="observacao-encomenda" name="observacao" maxLength={200} autoComplete="off" className={classeEntrada} aria-describedby="observacao-encomenda-dica" />
      </Campo>
      <div>
        <BotaoEnviar textoEnviando="Registrando…">
          <PackagePlus aria-hidden className="size-5" /> Registrar encomenda
        </BotaoEnviar>
      </div>
    </Formulario>
    </div>
  );
}

/** Entregar: abre uma janela pedindo quem retirou e a confirmação. */
export function BotaoEntregar({ id, descricao }: { id: string; descricao: string }) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  return (
    <>
      <Botao variante="primario" tamanho="pequeno" onClick={() => janela.current?.showModal()} icone={<PackageCheck aria-hidden className="size-4" />}>
        Entregar
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby={`entregar-${id}`}
        className="m-auto w-[min(92vw,30rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id={`entregar-${id}`} className="text-xl font-bold">
            Entregar encomenda
          </h2>
          <p className="text-ink-2">{descricao}</p>
          <Formulario
            acao={entregarEncomenda}
            aoSalvar={() => {
              janela.current?.close();
              router.refresh();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Campo id={`retirou-${id}`} rotulo="Quem retirou">
              <input id={`retirou-${id}`} name="retiradoPor" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
            </Campo>
            <label className={classeCaixa}>
              <input type="checkbox" name="confirmado" required className="mt-1 size-5 shrink-0 accent-[var(--pine)]" />
              <span>Entreguei a encomenda nas mãos desta pessoa.</span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao variante="secundario" onClick={() => janela.current?.close()}>
                Voltar
              </Botao>
              <BotaoEnviar textoEnviando="Registrando…">Confirmar entrega</BotaoEnviar>
            </div>
          </Formulario>
        </div>
      </dialog>
    </>
  );
}
