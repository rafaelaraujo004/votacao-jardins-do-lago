"use client";

/**
 * Pedido de reserva do morador: escolhe uma faixa livre do dia e confirma.
 * Se a área tiver exigências, elas aparecem antes do botão, com a caixa
 * "Li e concordo com as regras" obrigatória (o aceite fica gravado na reserva).
 * O servidor confere tudo de novo (horário livre, antecedência, limites, aceite).
 */
import { useRouter } from "next/navigation";
import { CalendarCheck, ListChecks, Send } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { pedirReserva } from "@/server/acoes/reservas";
import { cx } from "@/lib/cx";

export function FormularioPedido({
  areaId,
  data,
  faixas,
  exigeAprovacao,
  exigencias = [],
}: {
  areaId: string;
  data: string;
  /** Só as faixas LIVRES do dia. */
  faixas: { id: string; rotulo: string; horario: string }[];
  exigeAprovacao: boolean;
  /** Regras que o morador precisa aceitar antes de pedir. */
  exigencias?: string[];
}) {
  const router = useRouter();
  return (
    <Formulario acao={pedirReserva} aoSalvar={() => router.refresh()}>
      <input type="hidden" name="areaId" value={areaId} />
      <input type="hidden" name="data" value={data} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Escolha o horário</legend>
        {faixas.map((f, i) => (
          <label
            key={f.id}
            className={cx(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-2 shadow-relevo",
              "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
              "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
            )}
          >
            <input type="radio" name="faixaId" value={f.id} required defaultChecked={faixas.length === 1 && i === 0} className="size-5 accent-pine" />
            <span className="flex min-w-0 flex-col leading-tight">
              <b>{f.rotulo}</b>
              <span className="text-[0.88rem] text-muted">{f.horario}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Campo id="observacao" rotulo="Observação (opcional)" dica="Ex.: aniversário, número aproximado de convidados. Não coloque CPF nem dados bancários.">
        <textarea id="observacao" name="observacao" rows={2} maxLength={300} className={`${classeEntrada} py-3`} aria-describedby="observacao-dica" />
      </Campo>

      {exigencias.length ? (
        <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-warn bg-warn-soft p-4">
          <b className="flex items-center gap-2 text-ink">
            <ListChecks aria-hidden className="size-5 text-warn" /> Antes de pedir, leia as regras
          </b>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-2">
            {exigencias.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-bold text-ink">
            <input type="checkbox" name="aceite" value="sim" required className="size-6 shrink-0 accent-pine" />
            Li e concordo com as regras
          </label>
        </div>
      ) : null}

      <div>
        <BotaoEnviar largo textoEnviando="Enviando…">
          {exigeAprovacao ? (
            <>
              <Send aria-hidden className="size-5" /> Pedir reserva
            </>
          ) : (
            <>
              <CalendarCheck aria-hidden className="size-5" /> Reservar
            </>
          )}
        </BotaoEnviar>
      </div>
      {exigeAprovacao ? (
        <p className="text-[0.9rem] text-muted">Esta área precisa de aprovação: o pedido fica “aguardando aprovação” até a administração responder.</p>
      ) : null}
    </Formulario>
  );
}
