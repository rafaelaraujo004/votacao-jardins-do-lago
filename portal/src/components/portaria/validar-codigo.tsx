"use client";

/**
 * "Validar código": a portaria digita o código, confere de quem é e só então
 * registra a entrada. A entrada confere tudo de novo no servidor (transação).
 */
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, DoorOpen, House, KeyRound, MessageSquareText, Tag, UserRound, X } from "lucide-react";
import { consultarCodigo, registrarEntradaComCodigo } from "@/server/acoes/portaria";
import { Alerta } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { descreverPeriodo, formatarCodigo, nomeTipoVisita } from "@/lib/portaria";
import type { ContatoDaCasa } from "@/server/dados/portaria";
import { AvisoDepoisDaEntrada, acharEntrada, type EntradaDentro, type EntradaProcurada } from "./aviso-entrada";

export function ValidarCodigo({
  dentro,
  contatos,
  condominio,
}: {
  /** Quem está dentro (para achar a entrada que acabou de ser registrada e oferecer o aviso). */
  dentro: EntradaDentro[];
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
}) {
  const [estado, consultar] = useActionState(consultarCodigo, null);
  const [procurada, setProcurada] = useState<EntradaProcurada | null>(null);
  const recente = acharEntrada(dentro, procurada);
  const [limpoNaVez, setLimpoNaVez] = useState<number | null>(null);
  const [digitado, setDigitado] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const atual = estado && estado.vez !== limpoNaVez ? estado : null;

  function limpar() {
    if (estado) setLimpoNaVez(estado.vez);
    setDigitado("");
    // Volta o cursor para o código: o próximo visitante já pode ser digitado.
    campo.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      {recente ? <AvisoDepoisDaEntrada entrada={recente} contatos={contatos} condominio={condominio} aoFechar={() => setProcurada(null)} /> : null}
      <form action={consultar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="codigo-acesso" className="font-bold">
            Código do visitante
          </label>
          <input
            id="codigo-acesso"
            name="codigo"
            required
            ref={campo}
            value={digitado}
            onChange={(e) => {
              setDigitado(formatarCodigo(e.target.value).slice(0, 7));
              // Mudou o código: some o resultado antigo (para não registrar a pessoa errada).
              if (estado) setLimpoNaVez(estado.vez);
            }}
            placeholder="K7M-4PX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={9}
            className="afundado min-h-16 w-full rounded-2xl border-2 border-transparent px-4 text-center font-display text-[2rem] font-extrabold tracking-[0.18em] text-ink uppercase placeholder:text-muted/60 focus:border-pine focus:outline-none"
          />
        </div>
        <BotaoEnviar textoEnviando="Conferindo…">
          <KeyRound aria-hidden className="size-5" /> Validar
        </BotaoEnviar>
      </form>

      {atual && !atual.ok ? (
        <Alerta tipo="erro" titulo="Código não confere">
          {atual.erro}
        </Alerta>
      ) : null}

      {atual?.ok ? (
        <div className="surgir flex flex-col gap-3 rounded-[22px] border-2 border-borda-luz bg-surface-item p-4">
          <dl className="grid gap-2.5 sm:grid-cols-2">
            <Linha icone={UserRound} rotulo="Visitante" valor={atual.visita.nome} forte />
            <Linha icone={House} rotulo="Casa" valor={atual.visita.unidadeRotulo} forte />
            <Linha icone={Tag} rotulo="Tipo" valor={nomeTipoVisita(atual.visita.tipo)} />
            <Linha
              icone={CalendarDays}
              rotulo="Validade"
              valor={`${descreverPeriodo(atual.visita.data, atual.visita.validaAte)} · ${atual.visita.usoUnico ? "uso único" : "vários usos"}`}
            />
            {atual.visita.observacao ? <Linha icone={MessageSquareText} rotulo="Observação" valor={atual.visita.observacao} /> : null}
            {atual.visita.autorizadoPor ? <Linha icone={UserRound} rotulo="Autorizado por" valor={atual.visita.autorizadoPor} /> : null}
          </dl>

          {atual.visita.recusa ? (
            <Alerta tipo="erro" titulo="Não liberar com este código">
              {atual.visita.recusa} Se for o caso, ligue para o morador e use “Visitante sem código”.
            </Alerta>
          ) : (
            <Formulario
              acao={registrarEntradaComCodigo}
              aoSalvar={() => {
                setProcurada({ nome: atual.visita.nome, unidadeRotulo: atual.visita.unidadeRotulo });
                limpar();
                router.refresh();
              }}
            >
              <input type="hidden" name="codigo" value={atual.codigo} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <BotaoEnviar textoEnviando="Registrando…">
                  <DoorOpen aria-hidden className="size-5" /> Registrar entrada
                </BotaoEnviar>
                <Botao variante="secundario" onClick={limpar} icone={<X aria-hidden className="size-5" />}>
                  Cancelar
                </Botao>
              </div>
            </Formulario>
          )}

          {atual.visita.recusa ? (
            <div>
              <Botao variante="secundario" onClick={limpar} icone={<X aria-hidden className="size-5" />}>
                Limpar
              </Botao>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Linha({ icone: Icone, rotulo, valor, forte }: { icone: typeof House; rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icone aria-hidden className="mt-1 size-5 shrink-0 text-pine" />
      <div className="min-w-0">
        <dt className="rotulo-caixa">{rotulo}</dt>
        <dd className={forte ? "text-xl font-bold text-ink" : "text-ink-2"}>{valor}</dd>
      </div>
    </div>
  );
}
