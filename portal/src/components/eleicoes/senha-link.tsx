"use client";

/** Link de voto: a pessoa digita a senha de 6 números que veio na mensagem. */
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { entrarComSenha } from "@/server/acoes/votacao-links";
import { cx } from "@/lib/cx";

export function SenhaLink({
  codigo,
  motivo = "votar",
}: {
  codigo: string;
  motivo?: "votar" | "comprovante";
}) {
  const router = useRouter();
  return (
    <Formulario
      acao={entrarComSenha}
      limparAoSalvar={false}
      aoSalvar={() => router.refresh()}
    >
      <input type="hidden" name="codigo" value={codigo} />
      <label className="flex flex-col gap-2 text-center">
        <span className="inline-flex items-center justify-center gap-2 text-[1.05rem] font-bold">
          <KeyRound aria-hidden className="size-5 text-pine" />
          {motivo === "votar"
            ? "Digite a senha da sua casa"
            : "Digite a senha para baixar o comprovante"}
        </span>
        <span className="text-[0.9rem] text-muted">
          São 6 números. Ela veio na mesma mensagem do link.
        </span>
        <input
          name="senha"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          aria-label="Senha de 6 números"
          className={cx(
            classeEntrada,
            "mx-auto w-full max-w-[14rem] text-center font-mono text-[1.6rem] tracking-[0.4em]",
          )}
        />
      </label>
      <BotaoEnviar largo textoEnviando="Conferindo…">
        {motivo === "votar" ? "Entrar para votar" : "Liberar comprovante"}
      </BotaoEnviar>
    </Formulario>
  );
}
