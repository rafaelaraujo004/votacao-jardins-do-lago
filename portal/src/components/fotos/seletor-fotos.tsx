"use client";

/**
 * Escolher até 4 fotos para um anúncio ou comunicado.
 * - Cada foto é reduzida no próprio celular e enviada na hora (com a porcentagem).
 * - Dá para tirar uma foto da lista; a primeira é a capa.
 * - O formulário só leva as fotos que terminaram de enviar. Enquanto alguma
 *   ainda está indo, o botão de salvar avisa para esperar.
 * Fica dentro de um <form>: grava campos "fotos" escondidos, na ordem.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { prepararEnvioFoto } from "@/server/acoes/fotos";
import { enviarComPermissao } from "@/lib/firebase/envio-arquivo";
import { reduzirFoto } from "@/lib/foto-navegador";
import { MAXIMO_FOTOS, TAMANHO_MAXIMO_FOTO, type ModuloFoto } from "@/lib/fotos";
import { cx } from "@/lib/cx";

type Item =
  | { chave: string; tipo: "atual"; indice: number; url: string }
  | { chave: string; tipo: "nova"; previa: string; estado: "enviando"; porcento: number }
  | { chave: string; tipo: "nova"; previa: string; estado: "pronta"; caminho: string }
  | { chave: string; tipo: "nova"; previa: string; estado: "erro"; erro: string };

let contador = 0;
const novaChave = () => `f${Date.now()}-${contador++}`;

export function SeletorFotos({
  modulo,
  atuais = [],
  rotulo = "Fotos (opcional)",
  dica,
  aoMudar,
}: {
  modulo: ModuloFoto;
  /** Endereços das fotos que o item já tem (edição). */
  atuais?: string[];
  rotulo?: string;
  dica?: string;
  /** Avisa as fotos que estão na lista agora (para uma pré-visualização). */
  aoMudar?: (urls: string[]) => void;
}) {
  const idEntrada = useId();
  const idDica = useId();
  const [itens, setItens] = useState<Item[]>(() =>
    atuais.slice(0, MAXIMO_FOTOS).map((url, indice) => ({ chave: `atual-${indice}`, tipo: "atual", indice, url })),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const trava = useRef<HTMLInputElement>(null);
  const previas = useRef(new Set<string>());

  const enviando = itens.some((i) => i.tipo === "nova" && i.estado === "enviando");
  const vagas = MAXIMO_FOTOS - itens.length;

  // Enquanto envia, o formulário não deixa salvar (o navegador mostra a mensagem).
  useEffect(() => {
    trava.current?.setCustomValidity(enviando ? "Espere as fotos terminarem de enviar." : "");
  }, [enviando]);

  // Conta para quem está fora (ex.: pré-visualização do comunicado) as fotos da lista.
  useEffect(() => {
    aoMudar?.(itens.filter((i) => !(i.tipo === "nova" && i.estado === "erro")).map((i) => (i.tipo === "atual" ? i.url : i.previa)));
  }, [itens, aoMudar]);

  // Libera a memória das prévias ao sair da tela.
  useEffect(() => {
    const lista = previas.current;
    return () => {
      for (const url of lista) URL.revokeObjectURL(url);
    };
  }, []);

  const atualizar = (chave: string, novo: Item) => setItens((lista) => lista.map((i) => (i.chave === chave ? novo : i)));

  async function enviarUma(arquivo: File, chave: string, previa: string) {
    try {
      const foto = await reduzirFoto(arquivo);
      if (foto.size > TAMANHO_MAXIMO_FOTO) throw new Error("Foto grande demais mesmo depois de reduzida. Tente outra.");
      const permissao = await prepararEnvioFoto({ modulo, tipo: "image/jpeg", tamanho: foto.size });
      if (!permissao.ok) throw new Error(permissao.erro);
      await enviarComPermissao(foto, "image/jpeg", permissao, (porcento) =>
        atualizar(chave, { chave, tipo: "nova", previa, estado: "enviando", porcento }),
      );
      atualizar(chave, { chave, tipo: "nova", previa, estado: "pronta", caminho: permissao.caminho });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "O envio falhou. Tente de novo.";
      atualizar(chave, { chave, tipo: "nova", previa, estado: "erro", erro: mensagem });
    }
  }

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const escolhidas = Array.from(e.target.files ?? []);
    e.target.value = ""; // deixa escolher a mesma foto de novo depois de um erro
    if (!escolhidas.length) return;
    const cabem = escolhidas.slice(0, Math.max(0, vagas));
    setAviso(
      escolhidas.length > cabem.length
        ? `Cabem só ${MAXIMO_FOTOS} fotos. ${cabem.length ? `Ficaram as ${cabem.length} primeiras.` : "Tire uma foto para pôr outra."}`
        : null,
    );
    const novos = cabem.map((arquivo) => {
      const previa = URL.createObjectURL(arquivo);
      previas.current.add(previa);
      return { arquivo, item: { chave: novaChave(), tipo: "nova" as const, previa, estado: "enviando" as const, porcento: 0 } };
    });
    setItens((lista) => [...lista, ...novos.map((n) => n.item)]);
    // Uma de cada vez (cada envio usa a sua autorização de uso único).
    for (const n of novos) await enviarUma(n.arquivo, n.item.chave, n.item.previa);
  }

  function tirar(chave: string) {
    setItens((lista) => lista.filter((i) => i.chave !== chave));
    setAviso(null);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-bold">{rotulo}</legend>
      <p id={idDica} className="-mt-1 text-[0.9rem] text-muted">
        {dica ?? `Até ${MAXIMO_FOTOS} fotos. A primeira é a capa.`} A foto é reduzida no seu aparelho antes de enviar, e a
        localização gravada pelo celular é apagada.
      </p>

      {/* Campos que vão com o formulário: só as fotos prontas, na ordem. */}
      {itens.map((i) =>
        i.tipo === "atual" ? (
          <input key={i.chave} type="hidden" name="fotos" value={`atual:${i.indice}`} />
        ) : i.estado === "pronta" ? (
          <input key={i.chave} type="hidden" name="fotos" value={i.caminho} />
        ) : null,
      )}
      {/* Trava invisível: impede salvar enquanto uma foto ainda está indo. */}
      <input ref={trava} aria-hidden tabIndex={-1} className="sr-only" defaultValue="" />

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-describedby={idDica}>
        {itens.map((i, posicao) => {
          const url = i.tipo === "atual" ? i.url : i.previa;
          const erro = i.tipo === "nova" && i.estado === "erro";
          return (
            <li key={i.chave} className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou foto protegida do portal */}
              <img src={url} alt={`Foto ${posicao + 1}`} className={cx("size-full object-cover", erro && "opacity-40")} />
              {posicao === 0 && !erro ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-band/85 px-2 py-0.5 text-[0.72rem] font-bold text-band-fg">
                  Capa
                </span>
              ) : null}
              {i.tipo === "nova" && i.estado === "enviando" ? (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-[0.85rem] font-bold text-white">
                  <span className="flex flex-col items-center gap-1">
                    <LoaderCircle aria-hidden className="size-5 animate-spin" />
                    {i.porcento}%
                  </span>
                </span>
              ) : null}
              {erro ? (
                <span role="alert" className="absolute inset-x-1 bottom-1 flex items-start gap-1 rounded-lg bg-danger-soft p-1 text-[0.72rem] font-bold leading-tight text-danger">
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                  {i.erro}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => tirar(i.chave)}
                title="Tirar esta foto"
                className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75"
              >
                <X aria-hidden className="size-5" />
                <span className="sr-only">Tirar a foto {posicao + 1}</span>
              </button>
            </li>
          );
        })}
        {vagas > 0 ? (
          <li className="aspect-square">
            <label
              htmlFor={idEntrada}
              className="afundado flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line p-2 text-center has-[:focus-visible]:outline-2"
            >
              {itens.length ? <ImagePlus aria-hidden className="size-6 text-pine" /> : <Camera aria-hidden className="size-6 text-pine" />}
              <span className="text-[0.85rem] font-bold text-ink">{itens.length ? "Mais fotos" : "Pôr fotos"}</span>
            </label>
          </li>
        ) : null}
      </ul>
      <input id={idEntrada} type="file" accept="image/*" multiple onChange={aoEscolher} className="sr-only" />
      <div aria-live="polite" className="text-[0.9rem]">
        {enviando ? <p className="font-bold text-ink-2">Enviando fotos… espere terminar antes de salvar.</p> : null}
        {aviso ? <p className="font-bold text-warn">{aviso}</p> : null}
      </div>
    </fieldset>
  );
}
