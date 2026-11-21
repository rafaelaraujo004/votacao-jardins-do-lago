"use client";

/**
 * Link de voto: a pessoa digita a senha de 6 números que veio na mensagem.
 * - Aceita a senha digitada ou COLADA com espaços, pontos ou traços ("482 913", "48.29.13"):
 *   fica só com os números. Colou a linha inteira da mensagem? Usa o grupo de 6 números.
 *   Nada de balão do navegador ("formato inválido"): quem explica é a própria tela.
 * - Erro com título próprio ("A senha não conferiu"), sem apagar o que foi digitado.
 * - Queda de internet no meio: aviso para tentar de novo (não vai para a tela de erro).
 * - Acertou: aviso verde e a página se atualiza (mostra a cédula ou o comprovante).
 */
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Alerta, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar } from "@/components/ui/formulario";
import { useAvisos } from "@/components/ui/avisos";
import { entrarComSenha } from "@/server/acoes/votacao-links";
import { cx } from "@/lib/cx";

type Estado =
  | { tipo: "ok"; mensagem: string; vez: number }
  | { tipo: "erro"; titulo: string; erro: string; vez: number }
  | null;

const TAMANHO = 6;

/** Só os números da senha. Texto maior colado (ex.: a linha da mensagem): o grupo de 6 números. */
function limparSenha(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length <= TAMANHO) return digitos;
  const grupo = /(?<!\d)\d{6}(?!\d)/.exec(bruto.replace(/(\d)[\s.-](?=\d)/g, "$1"));
  return grupo ? grupo[0] : digitos.slice(0, TAMANHO);
}

/** Título do aviso de erro conforme o que o servidor respondeu. */
function tituloDoErro(erro: string): string {
  if (/espere/i.test(erro)) return "Muitas tentativas erradas";
  if (/senha|link inválido/i.test(erro)) return "A senha não conferiu";
  return "Não deu para entrar agora";
}

export function SenhaLink({
  codigo,
  motivo = "votar",
}: {
  codigo: string;
  motivo?: "votar" | "comprovante";
}) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const idDica = useId();
  const aviso = useRef<HTMLDivElement>(null);
  const [senha, setSenha] = useState("");

  const [estado, enviar] = useActionState(
    async (_anterior: Estado, dados: FormData): Promise<Estado> => {
      const vez = Date.now();
      const digitada = limparSenha(String(dados.get("senha") ?? ""));
      if (digitada.length !== TAMANHO)
        return {
          tipo: "erro",
          titulo: "A senha não conferiu",
          erro: "A senha tem 6 números. Confira na mensagem que você recebeu.",
          vez,
        };
      dados.set("senha", digitada);
      let r: Awaited<ReturnType<typeof entrarComSenha>>;
      try {
        r = await entrarComSenha(null, dados);
      } catch (erro) {
        unstable_rethrow(erro);
        r = null;
      }
      if (!r)
        return {
          tipo: "erro",
          titulo: "Não deu para conferir agora",
          erro: "Confira a internet e toque no botão de novo.",
          vez,
        };
      if (!r.ok) return { tipo: "erro", titulo: tituloDoErro(r.erro), erro: r.erro, vez };
      avisar("sucesso", r.mensagem);
      router.refresh();
      return { tipo: "ok", mensagem: r.mensagem, vez };
    },
    null,
  );

  // Erro novo: leva a pessoa até o aviso (no celular ele pode ficar fora da tela).
  useEffect(() => {
    if (estado?.tipo !== "erro") return;
    aviso.current?.focus({ preventScroll: true });
    aviso.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [estado]);

  return (
    <form action={enviar} noValidate className="flex flex-col gap-4">
      {estado?.tipo === "erro" ? (
        <div ref={aviso} tabIndex={-1} className="rounded-2xl outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-lake">
          <Alerta tipo="erro" titulo={estado.titulo}>
            {estado.erro}
          </Alerta>
        </div>
      ) : null}
      <input type="hidden" name="codigo" value={codigo} />
      <label className="flex flex-col gap-2 text-center">
        <span className="inline-flex items-center justify-center gap-2 text-[1.05rem] font-bold">
          <KeyRound aria-hidden className="size-5 text-pine" />
          {motivo === "votar"
            ? "Digite a senha da sua casa"
            : "Digite a senha para baixar o comprovante"}
        </span>
        <span id={idDica} className="text-[0.9rem] text-muted">
          São 6 números. Ela veio na mesma mensagem do link.
        </span>
        <input
          name="senha"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Senha de 6 números"
          aria-describedby={idDica}
          aria-invalid={estado?.tipo === "erro" || undefined}
          value={senha}
          onChange={(e) => setSenha(limparSenha(e.target.value))}
          className={cx(
            classeEntrada,
            "mx-auto w-full max-w-[14rem] text-center font-mono text-[1.6rem] tracking-[0.4em]",
          )}
        />
      </label>
      <BotaoEnviar largo textoEnviando="Conferindo…">
        {motivo === "votar" ? "Entrar para votar" : "Liberar comprovante"}
      </BotaoEnviar>
    </form>
  );
}
