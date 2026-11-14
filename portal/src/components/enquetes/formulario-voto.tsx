"use client";

/**
 * Voto da casa: escolhe a opção e confirma numa janela.
 * O voto NÃO pode ser mudado depois — a tela avisa antes de enviar.
 * O servidor confere tudo de novo (enquete aberta, casa ainda não votou).
 */
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Vote } from "lucide-react";
import { Alerta } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/formulario";
import { useAvisos } from "@/components/ui/avisos";
import { votarEnquete } from "@/server/acoes/enquetes";
import type { OpcaoEnquete } from "@/lib/enquetes";
import { cx } from "@/lib/cx";

export function FormularioVoto({ enqueteId, opcoes }: { enqueteId: string; opcoes: OpcaoEnquete[] }) {
  const router = useRouter();
  const janela = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const texto = opcoes.find((o) => o.id === escolhida)?.texto ?? "";
  const [estado, enviar] = useActionState(votarEnquete, null);
  const { avisar } = useAvisos();

  // Depois de enviar: fecha a janela (para o aviso de erro aparecer) e, se deu certo, atualiza a página.
  useEffect(() => {
    if (!estado) return;
    janela.current?.close();
    if (estado.ok) {
      avisar("sucesso", estado.mensagem);
      router.refresh();
    }
  }, [estado, avisar, router]);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado && !estado.ok ? (
        <Alerta tipo="erro" titulo="Não foi possível votar">
          {estado.erro}
        </Alerta>
      ) : null}
      <input type="hidden" name="id" value={enqueteId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Escolha uma opção</legend>
        {opcoes.map((o) => (
          <label
            key={o.id}
            className={cx(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-2 shadow-relevo",
              "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
              "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
            )}
          >
            <input
              type="radio"
              name="opcaoId"
              value={o.id}
              required
              checked={escolhida === o.id}
              onChange={() => setEscolhida(o.id)}
              className="size-5 shrink-0 accent-pine"
            />
            <span className="min-w-0 break-words font-bold">{o.texto}</span>
          </label>
        ))}
      </fieldset>

      <p className="text-[0.9rem] text-muted">
        Vale <b>um voto por casa</b>. Depois de enviado, o voto <b>não pode ser mudado</b> — assim o resultado fica simples de conferir.
      </p>

      <div>
        <Botao largo disabled={!escolhida} icone={<Vote aria-hidden className="size-5" />} onClick={() => janela.current?.showModal()}>
          Votar
        </Botao>
      </div>

      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        className="m-auto w-[min(92vw,28rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id={idTitulo} className="text-xl font-bold">
            Confirmar o voto da sua casa?
          </h2>
          <p className="text-ink-2">
            Você vai votar em <b className="text-ink">“{texto}”</b>. Este é o voto da casa inteira e não pode ser mudado depois.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao variante="secundario" onClick={() => janela.current?.close()}>
              Voltar
            </Botao>
            <BotaoEnviar textoEnviando="Enviando…">Confirmar voto</BotaoEnviar>
          </div>
        </div>
      </dialog>
    </form>
  );
}
