"use client";

/**
 * Formulário de cadastro/edição de um documento (por LINK).
 * O servidor confere tudo de novo; aqui só ajudamos a preencher certo.
 */
import { useRouter } from "next/navigation";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarDocumento } from "@/server/acoes/documentos";
import { CATEGORIAS_DOCUMENTO, NOME_CATEGORIA_CURTO, PUBLICOS_DOCUMENTO, type CategoriaDocumento } from "@/lib/documentos";

/** Só o que o formulário precisa (nada além disso vem do servidor). */
export type DocumentoParaEditar = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaDocumento;
  url: string;
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
