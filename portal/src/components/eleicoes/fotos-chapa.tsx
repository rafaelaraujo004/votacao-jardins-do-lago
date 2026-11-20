"use client";

/**
 * Comissão: foto de cada integrante da chapa. A pessoa escolhe a foto no celular ou
 * computador; aqui ela é recortada em quadrado e reduzida (320 px) antes de enviar.
 * Dá para trocar ou tirar a qualquer momento — é só a foto, não muda a votação.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { useAvisos } from "@/components/ui/avisos";
import { salvarFotoIntegrante } from "@/server/acoes/eleicoes";
import type { Candidato } from "@/lib/eleicoes";

const LADO = 320;

/** Lê a imagem escolhida, recorta o centro em quadrado e devolve um JPEG pequeno (data URL). */
async function reduzir(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("imagem"));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("canvas");
    // Recorte central, puxado um pouco para cima (rostos costumam ficar no alto da foto).
    const sx = (img.naturalWidth - lado) / 2;
    const sy = Math.max(0, (img.naturalHeight - lado) * 0.3);
    g.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Integrante({
  eleicaoId,
  c,
  foto,
}: {
  eleicaoId: string;
  c: Candidato;
  foto?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { avisar } = useAvisos();
  const [enviando, iniciar] = useTransition();
  const [previa, setPrevia] = useState<string | null>(null);

  function enviar(imagem: string) {
    iniciar(async () => {
      const dados = new FormData();
      dados.set("id", eleicaoId);
      dados.set("candidato", c.id);
      dados.set("foto", imagem);
      let r: Awaited<ReturnType<typeof salvarFotoIntegrante>>;
      try {
        r = await salvarFotoIntegrante(null, dados);
      } catch {
        // Sem internet ou site atualizado com a página aberta.
        avisar("erro", "Não deu para confirmar se a foto foi salva. Confira a internet e atualize a página para ver como ficou.");
        setPrevia(null);
        return;
      }
      if (r?.ok) {
        avisar("sucesso", r.mensagem);
        router.refresh();
      } else if (r) {
        avisar("erro", r.erro);
        setPrevia(null);
      }
    });
  }

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/"))
      return avisar("erro", "Escolha uma imagem (foto).");
    try {
      const imagem = await reduzir(arquivo);
      setPrevia(imagem);
      enviar(imagem);
    } catch {
      avisar("erro", "Não consegui abrir essa foto. Tente outra.");
    }
  }

  const mostrar = previa ?? foto;
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface font-bold text-destaque ring-2 ring-line">
        {mostrar ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pequena em data URL
          <img src={mostrar} alt="" className="size-full object-cover" />
        ) : (
          <Camera aria-hidden className="size-5 text-muted" />
        )}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <b className="block truncate text-[0.95rem]">{c.nome}</b>
        {c.funcao ? <span className="block truncate text-[0.78rem] text-muted">{c.funcao}</span> : null}
      </span>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={escolher}
        aria-label={`Foto de ${c.nome}`}
        tabIndex={-1}
      />
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={enviando}
          onClick={() => entrada.current?.click()}
          aria-label={`${mostrar ? "Trocar" : "Pôr"} a foto de ${c.nome}`}
          title={mostrar ? "Trocar foto" : "Pôr foto"}
          className="grid size-10 place-items-center rounded-full bg-surface text-lake shadow-relevo active:shadow-afundado disabled:opacity-60"
        >
          {enviando ? <span className="size-4 animate-spin rounded-full border-2 border-lake border-t-transparent" /> : <Camera aria-hidden className="size-[18px]" />}
        </button>
        {foto && !enviando ? (
          <button
            type="button"
            onClick={() => {
              setPrevia(null);
              enviar("");
            }}
            className="grid size-10 place-items-center rounded-full text-danger hover:shadow-afundado"
            aria-label={`Tirar a foto de ${c.nome}`}
            title="Tirar foto"
          >
            <Trash2 aria-hidden className="size-[18px]" />
          </button>
        ) : null}
      </span>
    </li>
  );
}

export function FotosChapa({
  eleicaoId,
  candidatos,
  fotos,
}: {
  eleicaoId: string;
  candidatos: Candidato[];
  fotos: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.88rem] text-muted">
        Toque na <b>câmera</b> para pôr ou trocar a foto. Aparece na árvore, na cédula e no link de voto.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {candidatos.map((c) => (
          <Integrante
            key={c.id}
            eleicaoId={eleicaoId}
            c={c}
            foto={fotos[c.id]}
          />
        ))}
      </ul>
    </div>
  );
}
