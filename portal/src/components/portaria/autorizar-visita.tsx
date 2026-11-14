"use client";

/**
 * Formulário "Autorizar visita" do morador.
 * Depois de salvar, mostra o código UMA vez (no banco só fica o HMAC),
 * com os botões "Copiar" e "Enviar pelo WhatsApp".
 */
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, Check, Copy, KeyRound, MessageCircle, Repeat, Ticket } from "lucide-react";
import { autorizarVisita } from "@/server/acoes/portaria";
import { Alerta, Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/formulario";
import { useAvisos } from "@/components/ui/avisos";
import { OpcoesPilula } from "./pecas";
import {
  descreverPeriodo,
  formatarCodigo,
  linkWhatsApp,
  MAX_DIAS_ANTECEDENCIA,
  MAX_DIAS_VALIDADE,
  mensagemWhatsApp,
  somarDias,
  TIPOS_VISITA,
} from "@/lib/portaria";
import { cx } from "@/lib/cx";

export function AutorizarVisita({ hoje, unidadeRotulo, endereco }: { hoje: string; unidadeRotulo: string; endereco: string }) {
  const [estado, enviar] = useActionState(autorizarVisita, null);
  const [fechadoNaVez, setFechadoNaVez] = useState<number | null>(null);
  const [duracao, setDuracao] = useState<"dia" | "periodo">("dia");
  const [data, setData] = useState(hoje);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Salvou: limpa o formulário e atualiza a lista "Minhas autorizações".
  useEffect(() => {
    if (estado?.ok) {
      form.current?.reset();
      router.refresh();
    }
  }, [estado, router]);

  const mostrarCodigo = estado?.ok && estado.vez !== fechadoNaVez;

  if (mostrarCodigo) {
    return (
      <CartaoCodigo
        codigo={estado.codigo}
        nome={estado.nome}
        data={estado.data}
        validaAte={estado.validaAte}
        usoUnico={estado.usoUnico}
        unidadeRotulo={unidadeRotulo}
        endereco={endereco}
        aoFechar={() => {
          setFechadoNaVez(estado.vez);
          setDuracao("dia");
          setData(hoje);
        }}
      />
    );
  }

  return (
    <form ref={form} action={enviar} className="flex flex-col gap-4">
      {estado && !estado.ok ? (
        <Alerta tipo="erro" titulo="Não foi possível autorizar">
          {estado.erro}
        </Alerta>
      ) : null}

      <Campo id="nome-visitante" rotulo="Nome do visitante" dica="Como aparece no documento. Não precisa de CPF.">
        <input
          id="nome-visitante"
          name="nome"
          required
          minLength={2}
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Maria Souza"
          className={classeEntrada}
          aria-describedby="nome-visitante-dica"
        />
      </Campo>

      <OpcoesPilula
        nome="tipo"
        legenda="Tipo"
        padrao="visita"
        opcoes={Object.entries(TIPOS_VISITA).map(([valor, rotulo]) => ({ valor, rotulo }))}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Validade</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["dia", "Só um dia", CalendarDays],
              ["periodo", "Vários dias", CalendarRange],
            ] as const
          ).map(([valor, rotulo, Icone]) => (
            <label
              key={valor}
              className={cx(
                "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-3 font-bold",
                "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
                duracao === valor ? "border-pine text-destaque shadow-afundado" : "border-borda-luz bg-surface text-ink-2 shadow-relevo",
              )}
            >
              <input
                type="radio"
                name="duracao"
                value={valor}
                checked={duracao === valor}
                onChange={() => setDuracao(valor)}
                className="sr-only"
              />
              <Icone aria-hidden className="size-5" />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="data-visita" rotulo={duracao === "dia" ? "Dia da visita" : "Primeiro dia"}>
          <input
            id="data-visita"
            name="data"
            type="date"
            required
            min={hoje}
            max={somarDias(hoje, MAX_DIAS_ANTECEDENCIA)}
            value={data}
            onChange={(e) => setData(e.target.value)}
            className={classeEntrada}
          />
        </Campo>
        {duracao === "periodo" ? (
          <Campo id="valida-ate" rotulo="Último dia" dica={`No máximo ${MAX_DIAS_VALIDADE} dias.`}>
            <input
              id="valida-ate"
              name="validaAte"
              type="date"
              required
              min={data || hoje}
              max={somarDias(data || hoje, MAX_DIAS_VALIDADE - 1)}
              className={classeEntrada}
              aria-describedby="valida-ate-dica"
            />
          </Campo>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-[0.92rem] text-ink-2">
        {duracao === "dia" ? (
          <>
            <Ticket aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" /> Código de uso único: depois que a pessoa entra, ele
            não vale mais.
          </>
        ) : (
          <>
            <Repeat aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" /> O mesmo código vale todos os dias do período (bom para
            prestadores de serviço).
          </>
        )}
      </p>

      <Campo id="observacao-visita" rotulo="Observação (opcional)" dica="Ex.: chega de moto, placa ABC1D23.">
        <input
          id="observacao-visita"
          name="observacao"
          maxLength={200}
          autoComplete="off"
          className={classeEntrada}
          aria-describedby="observacao-visita-dica"
        />
      </Campo>

      <div>
        <BotaoEnviar textoEnviando="Gerando código…">
          <KeyRound aria-hidden className="size-5" /> Autorizar e gerar código
        </BotaoEnviar>
      </div>
    </form>
  );
}

/** O código aparece só aqui, uma vez. */
function CartaoCodigo({
  codigo,
  nome,
  data,
  validaAte,
  usoUnico,
  unidadeRotulo,
  endereco,
  aoFechar,
}: {
  codigo: string;
  nome: string;
  data: string;
  validaAte: string;
  usoUnico: boolean;
  unidadeRotulo: string;
  endereco: string;
  aoFechar: () => void;
}) {
  const { avisar } = useAvisos();
  const [copiado, setCopiado] = useState(false);
  const mensagem = mensagemWhatsApp({ nomeVisitante: nome, codigo, data, validaAte, unidadeRotulo, endereco });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(formatarCodigo(codigo));
      setCopiado(true);
      avisar("sucesso", "Código copiado.");
    } catch {
      avisar("erro", "Não deu para copiar. Anote o código mostrado na tela.");
    }
  }

  return (
    <div className="surgir flex flex-col gap-4">
      <Alerta tipo="sucesso" titulo={`Visita de ${nome} autorizada`}>
        Vale {data === validaAte ? `no dia ${descreverPeriodo(data, validaAte)}` : descreverPeriodo(data, validaAte)}
        {usoUnico ? " · uso único" : " · vários usos no período"}.
      </Alerta>

      <div className="afundado flex flex-col items-center gap-1 rounded-[22px] px-4 py-6 text-center">
        <span className="rotulo-caixa">Código de acesso</span>
        <strong className="font-display text-[clamp(2.4rem,12vw,3.4rem)] font-extrabold tracking-[0.12em] text-destaque tabular-nums">
          {formatarCodigo(codigo)}
        </strong>
        <span className="text-[0.92rem] text-muted">Este código aparece só agora. Envie ao visitante antes de fechar.</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Botao variante="secundario" onClick={copiar} icone={copiado ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />}>
          {copiado ? "Copiado" : "Copiar"}
        </Botao>
        <a
          href={linkWhatsApp(mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          className="botao-verde inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 font-bold hover:brightness-110"
        >
          <MessageCircle aria-hidden className="size-5" /> Enviar pelo WhatsApp
        </a>
      </div>

      <Botao variante="discreto" onClick={aoFechar}>
        Pronto, autorizar outra visita
      </Botao>
    </div>
  );
}
