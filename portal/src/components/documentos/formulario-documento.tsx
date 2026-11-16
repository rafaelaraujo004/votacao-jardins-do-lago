"use client";

/**
 * Formulário de cadastro/edição de um documento: ARQUIVO enviado ao portal
 * (PDF, foto, Word, Excel) ou LINK (Google Drive etc.).
 * O servidor confere tudo de novo; aqui só ajudamos a preencher certo.
 */
import { useId, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Link2, LoaderCircle } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { prepararEnvioArquivo, salvarDocumento } from "@/server/acoes/documentos";
import { enviarArquivoDocumento } from "@/lib/firebase/envio-arquivo";
import { cx } from "@/lib/cx";
import {
  ACEITA_ARQUIVO,
  CATEGORIAS_DOCUMENTO,
  descreverArquivo,
  NOME_CATEGORIA_CURTO,
  PUBLICOS_DOCUMENTO,
  tipoArquivoAceito,
  TAMANHO_MAXIMO_ARQUIVO,
  type CategoriaDocumento,
} from "@/lib/documentos";

/** Só o que o formulário precisa (nada além disso vem do servidor). */
export type DocumentoParaEditar = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaDocumento;
  /** Só o link (vazio quando o documento é um arquivo). */
  url: string;
  /** Arquivo atual, se houver (sem o caminho interno). */
  arquivo: { tipo: string; tamanho: number } | null;
  visivelPara: string[];
  ativo: boolean;
};

export function FormularioDocumento({ documento }: { documento: DocumentoParaEditar | null }) {
  const router = useRouter();
  // Documento novo: já vem marcado "Moradores" (o caso mais comum).
  const marcados = documento?.visivelPara ?? ["morador"];

  return (
    <Formulario
      acao={salvarDocumento}
      limparAoSalvar={false}
      aoSalvar={() => {
        if (documento) router.refresh();
        else router.push("/admin/documentos");
      }}
    >
      {documento ? <input type="hidden" name="id" value={documento.id} /> : null}

      <Campo id="titulo" rotulo="Título">
        <input
          id="titulo"
          name="titulo"
          required
          minLength={3}
          maxLength={120}
          defaultValue={documento?.titulo}
          placeholder="Ex.: Regimento interno 2025"
          className={classeEntrada}
        />
      </Campo>

      <OrigemDocumento documento={documento} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="categoria" rotulo="Categoria">
          <select id="categoria" name="categoria" required defaultValue={documento?.categoria ?? ""} className={classeEntrada}>
            <option value="" disabled>
              Escolha…
            </option>
            {CATEGORIAS_DOCUMENTO.map((c) => (
              <option key={c} value={c}>
                {NOME_CATEGORIA_CURTO[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="ativo" rotulo="Situação">
          <select id="ativo" name="ativo" defaultValue={documento?.ativo === false ? "nao" : "sim"} className={classeEntrada}>
            <option value="sim">Visível (aparece na lista)</option>
            <option value="nao">Desativado (não aparece)</option>
          </select>
        </Campo>
      </div>

      <Campo id="descricao" rotulo="Descrição (opcional)" dica="Uma frase curta sobre o documento.">
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          maxLength={500}
          defaultValue={documento?.descricao}
          placeholder="Ex.: Aprovado na assembleia de março."
          className={`${classeEntrada} py-3`}
          aria-describedby="descricao-dica"
        />
      </Campo>

      <fieldset className="flex flex-col gap-2 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">Quem pode ver</legend>
        <p className="text-[0.92rem] text-muted">A administração sempre vê todos os documentos.</p>
        {PUBLICOS_DOCUMENTO.map((p) => (
          <label key={p.papel} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="visivelPara"
              value={p.papel}
              defaultChecked={marcados.includes(p.papel)}
              className="size-5 shrink-0 accent-[var(--pine)]"
            />
            <span>{p.rotulo}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <BotaoEnviar>{documento ? "Salvar alterações" : "Cadastrar documento"}</BotaoEnviar>
      </div>
    </Formulario>
  );
}

type Envio =
  | { fase: "nada" }
  | { fase: "enviando"; nome: string; porcento: number }
  | { fase: "pronto"; nome: string; caminho: string; descricao: string }
  | { fase: "erro"; mensagem: string };

/** Escolha entre enviar um arquivo ou colar um link (e o envio do arquivo, com progresso). */
function OrigemDocumento({ documento }: { documento: DocumentoParaEditar | null }) {
  const idArquivo = useId();
  const [origem, setOrigem] = useState<"arquivo" | "link">(documento && !documento.arquivo ? "link" : "arquivo");
  const [envio, setEnvio] = useState<Envio>({ fase: "nada" });

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de um erro
    if (!arquivo) return;
    if (!tipoArquivoAceito(arquivo.type)) {
      setEnvio({ fase: "erro", mensagem: "Tipo de arquivo não aceito. Envie PDF, foto (JPG/PNG), Word ou Excel." });
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
      setEnvio({ fase: "erro", mensagem: "Arquivo grande demais: o máximo é 20 MB." });
      return;
    }
    setEnvio({ fase: "enviando", nome: arquivo.name, porcento: 0 });
    try {
      const permissao = await prepararEnvioArquivo({ nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size });
      if (!permissao.ok) throw new Error(permissao.erro);
      await enviarArquivoDocumento(arquivo, permissao, (porcento) =>
        setEnvio({ fase: "enviando", nome: arquivo.name, porcento }),
      );
      setEnvio({
        fase: "pronto",
        nome: arquivo.name,
        caminho: permissao.caminho,
        descricao: descreverArquivo({ tipo: arquivo.type, tamanho: arquivo.size }),
      });
    } catch (erro) {
      setEnvio({ fase: "erro", mensagem: erro instanceof Error ? erro.message : "O envio falhou. Tente de novo." });
    }
  }

  const opcao = (valor: "arquivo" | "link", Icone: typeof FileUp, texto: string) => (
    <label
      className={cx(
        "flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-3 font-bold has-[:focus-visible]:outline-2",
        origem === valor ? "botao-verde" : "saltado text-ink",
      )}
    >
      <input
        type="radio"
        name="origem"
        value={valor}
        checked={origem === valor}
        onChange={() => setOrigem(valor)}
        className="sr-only"
      />
      <Icone aria-hidden className="size-5" /> {texto}
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 font-bold">Documento</legend>
      <div className="flex gap-2">
        {opcao("arquivo", FileUp, "Enviar arquivo")}
        {opcao("link", Link2, "Colar link")}
      </div>

      {origem === "arquivo" ? (
        <div className="flex flex-col gap-2">
          {/* O caminho só vai junto depois que o envio terminar. */}
          {envio.fase === "pronto" ? (
            <>
              <input type="hidden" name="arquivoCaminho" value={envio.caminho} />
              <input type="hidden" name="arquivoNome" value={envio.nome} />
            </>
          ) : null}

          <label
            htmlFor={idArquivo}
            className={cx(
              "afundado flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line px-4 py-3 text-center",
              envio.fase === "enviando" && "pointer-events-none opacity-70",
            )}
          >
            <FileUp aria-hidden className="size-6 text-pine" />
            <span className="font-bold text-ink">
              {envio.fase === "pronto" || documento?.arquivo ? "Trocar o arquivo" : "Escolher arquivo"}
            </span>
            <span className="text-[0.88rem] text-muted">PDF, foto (JPG/PNG), Word ou Excel · até 20 MB</span>
          </label>
          <input
            id={idArquivo}
            type="file"
            accept={ACEITA_ARQUIVO}
            onChange={aoEscolher}
            disabled={envio.fase === "enviando"}
            className="sr-only"
          />

          <div aria-live="polite" className="text-[0.92rem]">
            {envio.fase === "enviando" ? (
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-2 font-bold text-ink">
                  <LoaderCircle aria-hidden className="size-4 animate-spin" /> Enviando {envio.nome}… {envio.porcento}%
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-pine transition-[width]" style={{ width: `${envio.porcento}%` }} />
                </div>
              </div>
            ) : envio.fase === "pronto" ? (
              <p className="flex items-center gap-2 font-bold text-pine">
                <CheckCircle2 aria-hidden className="size-5" /> {envio.nome} enviado ({envio.descricao}). Agora é só salvar.
              </p>
            ) : envio.fase === "erro" ? (
              <p className="font-bold text-plum">{envio.mensagem}</p>
            ) : documento?.arquivo ? (
              <p className="text-muted">Arquivo atual: {descreverArquivo(documento.arquivo)}. Escolha outro só se quiser trocar.</p>
            ) : null}
          </div>
        </div>
      ) : (
        <Campo id="url" rotulo="Link do documento" dica="Cole o link de compartilhamento. Precisa começar com https://">
          <input
            id="url"
            name="url"
            type="url"
            inputMode="url"
            required
            maxLength={2000}
            pattern="https://.*"
            defaultValue={documento?.url}
            placeholder="https://drive.google.com/..."
            autoComplete="off"
            spellCheck={false}
            className={classeEntrada}
            aria-describedby="url-dica"
          />
        </Campo>
      )}
    </fieldset>
  );
}
