/**
 * Peças visuais dos documentos: ícone e etiqueta da categoria, o cartão
 * que abre o link e o aviso sobre como compartilhar o arquivo.
 */
import { BookOpen, ExternalLink, FileText, Landmark, ScrollText, Scale, type LucideIcon } from "lucide-react";
import { Alerta, Etiqueta } from "@/components/ui/basicos";
import { formatarData } from "@/lib/formato";
import { NOME_CATEGORIA_CURTO, servicoDoLink, type CategoriaDocumento } from "@/lib/documentos";

export const ICONE_CATEGORIA: Record<CategoriaDocumento, LucideIcon> = {
  regimento: BookOpen,
  convencao: Scale,
  ata: ScrollText,
  prestacao: Landmark,
  outro: FileText,
};

export function EtiquetaCategoria({ categoria }: { categoria: CategoriaDocumento }) {
  return (
    <Etiqueta tom="info" icone={ICONE_CATEGORIA[categoria]}>
      {NOME_CATEGORIA_CURTO[categoria]}
    </Etiqueta>
  );
}

/**
 * Cartão de um documento: o cartão inteiro é o link (alvo grande para o dedo).
 * Abre em outra aba, sem passar dados da página (noopener noreferrer).
 */
export function LinkDocumento({
  doc,
  fuso,
}: {
  doc: { titulo: string; descricao: string; categoria: CategoriaDocumento; url: string; atualizadoEm: Date | null };
  fuso: string;
}) {
  const Icone = ICONE_CATEGORIA[doc.categoria];
  const servico = servicoDoLink(doc.url);
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${doc.titulo} (abre em outra aba)`}
      className="saltado flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 transition-shadow active:shadow-afundado"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-lake-soft text-lake">
        <Icone aria-hidden className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold leading-tight text-ink">{doc.titulo}</span>
        {doc.descricao ? <span className="mt-0.5 text-[0.9rem] text-ink-2">{doc.descricao}</span> : null}
        <span className="mt-0.5 text-[0.8rem] text-muted">
          {[servico, doc.atualizadoEm ? `atualizado em ${formatarData(doc.atualizadoEm, fuso)}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-0.5 text-pine">
        <ExternalLink aria-hidden className="size-5" />
        <span className="text-[0.74rem] font-bold">Abrir</span>
      </span>
    </a>
  );
}

/** Explica ao síndico como deixar o arquivo acessível e por que o portal usa links. */
export function AvisoComoCompartilhar() {
  return (
    <Alerta tipo="info" titulo="Como cadastrar um documento">
      <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
        <li>Guarde o arquivo no Google Drive (ou OneDrive, Dropbox).</li>
        <li>
          Em <b>Compartilhar</b>, escolha <b>&ldquo;Qualquer pessoa com o link&rdquo;</b> e <b>Leitor</b> (pode ver, não pode editar).
        </li>
        <li>Copie o link e cole aqui. Ele precisa começar com https://</li>
      </ol>
      <p className="mt-2 text-[0.9rem]">
        Guardar os arquivos dentro do próprio portal exige um plano pago do serviço de hospedagem. Por enquanto, usamos links
        (isso pode mudar depois).
      </p>
    </Alerta>
  );
}
