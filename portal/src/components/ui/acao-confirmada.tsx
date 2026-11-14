"use client";

/**
 * Botão que pede confirmação e então chama uma Server Action com campos fixos.
 * Ex.: suspender acesso, estornar lançamento, publicar o mês.
 */
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BotaoComConfirmacao } from "./confirmacao";
import { useAvisos } from "./avisos";
import type { ResultadoAcao } from "./formulario";

export function AcaoConfirmada({
  acao,
  campos,
  children,
  titulo,
  mensagem,
  textoConfirmar,
  perigo = false,
  variante = "secundario",
}: {
  acao: (anterior: ResultadoAcao, dados: FormData) => Promise<ResultadoAcao>;
  campos: Record<string, string>;
  children: ReactNode;
  titulo: string;
  mensagem: ReactNode;
  textoConfirmar: string;
  perigo?: boolean;
  variante?: "primario" | "secundario" | "perigo";
}) {
  const { avisar } = useAvisos();
  const router = useRouter();

  async function confirmar() {
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    const r = await acao(null, dados);
    if (r?.ok) {
      avisar("sucesso", r.mensagem);
      router.refresh();
    } else if (r) {
      avisar("erro", r.erro);
    }
  }

  return (
    <BotaoComConfirmacao
      titulo={titulo}
      mensagem={mensagem}
      textoConfirmar={textoConfirmar}
      perigo={perigo}
      variante={variante}
      aoConfirmar={confirmar}
    >
      {children}
    </BotaoComConfirmacao>
  );
}
