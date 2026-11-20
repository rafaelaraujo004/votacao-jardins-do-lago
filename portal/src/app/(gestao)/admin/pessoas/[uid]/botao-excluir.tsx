"use client";

/**
 * Botão "Excluir cadastro" (só a administração vê). Pede confirmação de perigo,
 * chama a ação e, deu certo, volta para a lista (a página desta pessoa deixa de existir).
 */
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { BotaoComConfirmacao } from "@/components/ui/confirmacao";
import { useAvisos } from "@/components/ui/avisos";
import { excluirPessoa } from "@/server/acoes/pessoas";

export function BotaoExcluirPessoa({ uid, nome, suspenso = false }: { uid: string; nome: string; suspenso?: boolean }) {
  const { avisar } = useAvisos();
  const router = useRouter();

  async function confirmar() {
    const dados = new FormData();
    dados.set("uid", uid);
    const r = await excluirPessoa(null, dados);
    if (r?.ok) {
      avisar("sucesso", r.mensagem);
      router.replace("/admin/pessoas");
      router.refresh();
    } else if (r) {
      avisar("erro", r.erro);
    }
  }

  return (
    <BotaoComConfirmacao
      titulo={`Excluir o cadastro de ${nome}?`}
      mensagem={
        <>
          <p>A pessoa sai de “Moradores e equipe” e perde o acesso ao portal. Não dá para desfazer.</p>
          <p className="mt-2">
            Os registros antigos (reservas, solicitações, auditoria) continuam guardados. Anúncios dela nos classificados saem do ar.
          </p>
          <p className="mt-2">
            {suspenso
              ? "O acesso já está suspenso. Só exclua se este cadastro não deve mais existir."
              : "Se for só por um tempo, use “Suspender acesso”: dá para reativar depois."}
          </p>
        </>
      }
      textoConfirmar="Sim, excluir"
      perigo
      variante="perigo"
      aoConfirmar={confirmar}
    >
      <Trash2 aria-hidden className="size-5" /> Excluir cadastro
    </BotaoComConfirmacao>
  );
}
