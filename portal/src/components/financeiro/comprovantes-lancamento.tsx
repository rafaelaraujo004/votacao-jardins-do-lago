"use client";

/**
 * Anexar e remover comprovantes de um lançamento (tela da gestão).
 * O arquivo vai direto para o Storage com a autorização de uso único e só depois o
 * servidor confere e grava no lançamento. Dá para escolher vários arquivos de uma vez.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { anexarComprovante, prepararEnvioComprovante, removerComprovante } from "@/server/acoes/comprovantes";
import { enviarComPermissao } from "@/lib/firebase/envio-arquivo";
import { ACEITA_COMPROVANTE, MAXIMO_COMPROVANTES, TAMANHO_MAXIMO_COMPROVANTE, tipoComprovanteAceito } from "@/lib/comprovantes";
import { Botao } from "@/components/ui/botao";

type Aviso = { tom: "andamento" | "ok" | "erro"; texto: string } | null;

export function AnexarComprovante({ lancamentoId, quantidade }: { lancamentoId: string; quantidade: number }) {
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [aviso, setAviso] = useState<Aviso>(null);
  const enviando = aviso?.tom === "andamento";
  const cheio = quantidade >= MAXIMO_COMPROVANTES;

  async function enviar(arquivos: File[]) {
    if (!arquivos.length) return;
    if (quantidade + arquivos.length > MAXIMO_COMPROVANTES) {
      setAviso({ tom: "erro", texto: `No máximo ${MAXIMO_COMPROVANTES} comprovantes por lançamento.` });
      return;
    }
    let anexados = 0;
    for (const arquivo of arquivos) {
      const nome = arquivo.name;
      try {
        if (!tipoComprovanteAceito(arquivo.type)) throw new Error(`"${nome}": envie PDF ou foto (JPG, PNG).`);
        if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) throw new Error(`"${nome}" passa de 20 MB.`);
        setAviso({ tom: "andamento", texto: `Enviando "${nome}"…` });
        const permissao = await prepararEnvioComprovante({ nome, tipo: arquivo.type, tamanho: arquivo.size });
        if (!permissao.ok) throw new Error(permissao.erro);
        await enviarComPermissao(arquivo, arquivo.type, permissao, (p) => setAviso({ tom: "andamento", texto: `Enviando "${nome}"… ${p}%` }));
        const dados = new FormData();
        dados.set("lancamentoId", lancamentoId);
        dados.set("caminho", permissao.caminho);
        dados.set("nome", nome);
        const r = await anexarComprovante(null, dados);
        if (!r?.ok) throw new Error(r?.erro ?? "Não foi possível anexar. Tente de novo.");
        anexados++;
      } catch (erro) {
        setAviso({ tom: "erro", texto: erro instanceof Error ? erro.message : "Não foi possível anexar. Tente de novo." });
        if (anexados) router.refresh();
        return;
      }
    }
    setAviso({ tom: "ok", texto: anexados === 1 ? "Comprovante anexado." : `${anexados} comprovantes anexados.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={entrada}
        type="file"
        accept={ACEITA_COMPROVANTE}
        multiple
        hidden
        onChange={(e) => {
          const arquivos = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = ""; // permite escolher o mesmo arquivo de novo
          void enviar(arquivos);
        }}
      />
      <Botao
        variante="secundario"
        tamanho="pequeno"
        carregando={enviando}
        disabled={cheio}
        title={cheio ? `Este lançamento já tem ${MAXIMO_COMPROVANTES} comprovantes.` : undefined}
        onClick={() => entrada.current?.click()}
        icone={<Paperclip aria-hidden className="size-4" />}
      >
        {enviando ? "Enviando…" : "Anexar comprovante"}
      </Botao>
      <p role="status" aria-live="polite" className={aviso ? (aviso.tom === "erro" ? "text-[0.86rem] font-semibold text-danger" : "text-[0.86rem] text-ink-2") : "sr-only"}>
        {aviso?.texto ?? ""}
      </p>
    </div>
  );
}

export function RemoverComprovante({ lancamentoId, comprovanteId, nome }: { lancamentoId: string; comprovanteId: string; nome: string }) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);

  async function remover() {
    if (!window.confirm(`Remover o comprovante "${nome}" deste lançamento? O arquivo é apagado (fica registrado na auditoria).`)) return;
    setRemovendo(true);
    const dados = new FormData();
    dados.set("lancamentoId", lancamentoId);
    dados.set("comprovanteId", comprovanteId);
    const r = await removerComprovante(null, dados);
    setRemovendo(false);
    if (!r?.ok) {
      window.alert(r?.erro ?? "Não foi possível remover. Tente de novo.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void remover()}
      disabled={removendo}
      aria-label={`Remover o comprovante ${nome}`}
      title="Remover comprovante"
      className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-plum-soft hover:text-plum disabled:opacity-50"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}
