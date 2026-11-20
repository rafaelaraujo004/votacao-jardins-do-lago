/**
 * Fotos de anúncios e comunicados: caminhos aceitos, leitura do banco,
 * campos do formulário e redução de tamanho.
 */
import { describe, expect, it } from "vitest";
import {
  MAXIMO_FOTOS,
  TAMANHO_MAXIMO_FOTO,
  caminhoFotoValido,
  enderecoFoto,
  enderecosFotos,
  fotosRemovidas,
  lerFotos,
  lerFotosDoFormulario,
  nomeArquivoFoto,
  pastaFotos,
  tamanhoReduzido,
  tipoFotoAceito,
} from "@/lib/fotos";

const C = "jardins-do-lago";
const ENVIO = "0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b";
const CAMINHO = `condominiums/${C}/classifieds/${ENVIO}/foto.jpg`;

describe("caminhos das fotos", () => {
  it("monta a pasta de cada módulo dentro do condomínio", () => {
    expect(pastaFotos(C, "classificados")).toBe(`condominiums/${C}/classifieds/`);
    expect(pastaFotos(C, "comunicados")).toBe(`condominiums/${C}/announcements/`);
    expect(nomeArquivoFoto("image/jpeg")).toBe("foto.jpg");
    expect(nomeArquivoFoto("image/png")).toBe("foto.png");
  });

  it("aceita só o formato gerado pelo servidor, do mesmo condomínio e módulo", () => {
    expect(caminhoFotoValido(CAMINHO, C, "classificados")).toBe(true);
    expect(caminhoFotoValido(CAMINHO, "outro-condominio", "classificados")).toBe(false);
    expect(caminhoFotoValido(CAMINHO, C, "comunicados")).toBe(false);
    expect(caminhoFotoValido(`condominiums/${C}/classifieds/${ENVIO}/../documents/x/foto.jpg`, C, "classificados")).toBe(false);
    expect(caminhoFotoValido(`condominiums/${C}/classifieds/nao-e-uuid/foto.jpg`, C, "classificados")).toBe(false);
    expect(caminhoFotoValido(`condominiums/${C}/classifieds/${ENVIO}/pagina.html`, C, "classificados")).toBe(false);
    expect(caminhoFotoValido(`condominiums/${C}/classifieds/${ENVIO}/foto.jpg/extra`, C, "classificados")).toBe(false);
    expect(caminhoFotoValido(123, C, "classificados")).toBe(false);
  });

  it("só aceita JPEG, PNG e WebP", () => {
    expect(tipoFotoAceito("image/jpeg")).toBe(true);
    expect(tipoFotoAceito("image/webp")).toBe(true);
    expect(tipoFotoAceito("image/svg+xml")).toBe(false);
    expect(tipoFotoAceito("text/html")).toBe(false);
  });
});

describe("lerFotos (banco)", () => {
  it("ignora itens fora do formato, de outro condomínio ou grandes demais", () => {
    const fotos = lerFotos(
      [
        { caminho: CAMINHO, tipo: "image/jpeg", tamanho: 1000 },
        { caminho: CAMINHO.replace(C, "vizinho"), tipo: "image/jpeg", tamanho: 1000 },
        { caminho: CAMINHO, tipo: "text/html", tamanho: 1000 },
        { caminho: CAMINHO, tipo: "image/jpeg", tamanho: TAMANHO_MAXIMO_FOTO + 1 },
        "lixo",
        null,
      ],
      C,
      "classificados",
    );
    expect(fotos).toEqual([{ caminho: CAMINHO, tipo: "image/jpeg", tamanho: 1000 }]);
    expect(lerFotos(undefined, C, "classificados")).toEqual([]);
  });

  it("nunca passa de 4 fotos", () => {
    const muitas = Array.from({ length: 6 }, () => ({ caminho: CAMINHO, tipo: "image/jpeg", tamanho: 10 }));
    expect(lerFotos(muitas, C, "classificados")).toHaveLength(MAXIMO_FOTOS);
  });
});

describe("endereço protegido", () => {
  it("aponta para /api/fotos com uma versão que muda quando a foto é trocada", () => {
    expect(enderecoFoto("classificados", "abc", 0, CAMINHO)).toBe(`/api/fotos/classificados/abc/0?v=${ENVIO.slice(0, 8)}`);
    const lista = enderecosFotos("comunicados", "xyz", [
      { caminho: CAMINHO, tipo: "image/jpeg", tamanho: 1 },
      { caminho: CAMINHO.replace("0f1e2d3c", "aaaabbbb"), tipo: "image/jpeg", tamanho: 1 },
    ]);
    expect(lista).toEqual([`/api/fotos/comunicados/xyz/0?v=0f1e2d3c`, `/api/fotos/comunicados/xyz/1?v=aaaabbbb`]);
  });
});

describe("campos do formulário", () => {
  it("separa fotos que ficam ('atual:N') e fotos novas, na ordem", () => {
    const r = lerFotosDoFormulario(["atual:1", CAMINHO, "", "atual:0"], C, "classificados");
    expect(r).toEqual({
      ok: true,
      fotos: [
        { tipo: "atual", indice: 1 },
        { tipo: "nova", caminho: CAMINHO },
        { tipo: "atual", indice: 0 },
      ],
    });
  });

  it("a mesma foto repetida conta uma vez", () => {
    const r = lerFotosDoFormulario([CAMINHO, CAMINHO], C, "classificados");
    expect(r.ok && r.fotos).toHaveLength(1);
  });

  it("recusa caminho de outro lugar e mais de 4 fotos", () => {
    expect(lerFotosDoFormulario(["condominiums/x/documents/y/Ata.pdf"], C, "classificados").ok).toBe(false);
    expect(lerFotosDoFormulario(Array.from({ length: 5 }, (_, i) => `atual:${i}`), C, "classificados").ok).toBe(false);
  });

  it("diz quais fotos antigas saíram (para apagar do Storage)", () => {
    const a = { caminho: CAMINHO, tipo: "image/jpeg" as const, tamanho: 1 };
    const b = { caminho: CAMINHO.replace("0f1e2d3c", "aaaabbbb"), tipo: "image/jpeg" as const, tamanho: 1 };
    expect(fotosRemovidas([a, b], [b])).toEqual([a.caminho]);
    expect(fotosRemovidas([a], [a])).toEqual([]);
  });
});

describe("tamanhoReduzido", () => {
  it("reduz o lado maior para 1600 px e mantém a proporção", () => {
    expect(tamanhoReduzido(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(tamanhoReduzido(3000, 4000)).toEqual({ largura: 1200, altura: 1600 });
  });
  it("não aumenta foto pequena e recusa tamanho inválido", () => {
    expect(tamanhoReduzido(800, 600)).toEqual({ largura: 800, altura: 600 });
    expect(tamanhoReduzido(0, 600)).toEqual({ largura: 0, altura: 0 });
  });
});
