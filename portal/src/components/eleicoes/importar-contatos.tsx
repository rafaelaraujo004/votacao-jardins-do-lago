"use client";

/** Comissão: enviar a lista do Word (CASA, NOME, CONTATOS) para importar os telefones. */
import { Upload } from "lucide-react";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { importarContatosVotacao } from "@/server/acoes/votacao-links";

export function ImportarContatos({ eleicaoId }: { eleicaoId: string }) {
  return (
    <Formulario acao={importarContatosVotacao}>
      <input type="hidden" name="id" value={eleicaoId} />
      <p className="text-[0.92rem] text-ink-2">
        Envie a lista do Word com as colunas <b>CASA</b>, <b>NOME</b> e{" "}
        <b>CONTATOS</b>. Casas com dois telefones recebem o link nos dois.
        Enviar de novo atualiza os contatos.
      </p>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface-item px-4 py-3">
        <Upload aria-hidden className="size-5 shrink-0 text-lake" />
        <span className="min-w-0 flex-1 text-[0.92rem]">
          <b>Escolher arquivo .docx</b>
          <input
            type="file"
            name="arquivo"
            required
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="mt-1 block w-full text-[0.85rem] text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1.5 file:font-bold"
          />
        </span>
      </label>
      <div>
        <BotaoEnviar textoEnviando="Importando…">Importar contatos</BotaoEnviar>
      </div>
    </Formulario>
  );
}
