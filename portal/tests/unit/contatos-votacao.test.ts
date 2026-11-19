/**
 * Contatos para o link de voto: leitura dos telefones e da tabela do Word, e o .docx em si.
 */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  formatarTelefone,
  lerTabelaContatos,
  lerTelefones,
  mensagemConvite,
  numeroDaCasa,
  primeiroNome,
} from "@/lib/contatos-votacao";
import { ErroDocx, lerTabelasDocx } from "@/server/docx";

describe("lerTelefones", () => {
  it("entende os formatos da lista", () => {
    expect(lerTelefones("(94)991234567").telefones).toEqual(["5594991234567"]);
    expect(lerTelefones("M (94)99123-4567/ F (94)98888-7777").telefones).toEqual(["5594991234567", "5594988887777"]);
    expect(lerTelefones("M (94) 991234567 F 94988887777").telefones).toEqual(["5594991234567", "5594988887777"]);
    expect(lerTelefones("+55 94 99123-4567").telefones).toEqual(["5594991234567"]);
  });
  it("dois números colados por espaço, quebra de linha ou ' - ' viram dois telefones", () => {
    expect(lerTelefones("94991234567 94988887777").telefones).toEqual(["5594991234567", "5594988887777"]);
    expect(lerTelefones("(94)99123-4567 | (94)98888-7777").telefones).toEqual(["5594991234567", "5594988887777"]);
    expect(lerTelefones("94991234567 - 94988887777").telefones).toEqual(["5594991234567", "5594988887777"]);
    expect(lerTelefones("9499123456 9498888777").telefones).toHaveLength(2);
  });
  it("número sem DDD recebe o DDD do condomínio, com aviso", () => {
    const r = lerTelefones("991234567");
    expect(r.telefones).toEqual(["5594991234567"]);
    expect(r.avisos[0]).toMatch(/sem DDD/);
  });
  it("celular antigo de 8 dígitos ganha o 9; repetido conta uma vez", () => {
    expect(lerTelefones("(94) 9123-4567 / 94 99123-4567").telefones).toEqual(["5594991234567"]);
  });
  it("ignora texto sem número e avisa número estranho", () => {
    expect(lerTelefones("não tem").telefones).toEqual([]);
    expect(lerTelefones("1234567890123456").avisos[0]).toMatch(/não reconhecido/);
  });
  it("formata para mostrar", () => {
    expect(formatarTelefone("5594991234567")).toBe("(94) 99123-4567");
  });
});

describe("lerTabelaContatos", () => {
  it("pula cabeçalho e linhas vazias, avisa casa sem número e casa repetida", () => {
    const r = lerTabelaContatos([
      ["CASA", "NOME", "CONTATOS"],
      ["02", "Maria \\ João", "(94)991234567/(94)988887777"],
      ["", "", ""],
      ["", "Sem casa", "94991112222"],
      ["01", "Ana", "94993334444"],
      ["1", "Ana de novo", "94995556666"],
    ]);
    expect(r.contatos.map((c) => c.numeroCasa)).toEqual([1, 2]);
    expect(r.contatos[1]).toMatchObject({ nome: "Maria / João", telefones: ["5594991234567", "5594988887777"] });
    expect(r.avisos.join(" ")).toMatch(/sem número de casa/);
    expect(r.avisos.join(" ")).toMatch(/Casa 1: aparece mais de uma vez/);
  });
  it("coluna CASA com dois números é ignorada (não adivinha)", () => {
    const r = lerTabelaContatos([["12/13", "Fulano", "94991234567"], ["Casa 140", "Ciclano", "94991234567"]]);
    expect(r.contatos.map((c) => c.numeroCasa)).toEqual([140]);
    expect(r.avisos[0]).toMatch(/mais de um número/);
  });
});

describe("numeroDaCasa e mensagem", () => {
  it("usa o campo número, ou os dígitos do rótulo/id", () => {
    expect(numeroDaCasa({ id: "x", numero: 12 })).toBe(12);
    expect(numeroDaCasa({ id: "casa-045", rotulo: "Casa 45" })).toBe(45);
    expect(numeroDaCasa({ id: "casa-007" })).toBe(7);
    expect(numeroDaCasa({ id: "portaria" })).toBeNull();
  });
  it("saudação com o primeiro nome e o link na mensagem", () => {
    expect(primeiroNome("MARIA DAS GRAÇAS / JOÃO")).toBe("Maria");
    const m = mensagemConvite({ nome: "ana souza", casa: "Casa 12", titulo: "Eleição 2026/2027", link: "https://x/votar/ABC", senha: "482913", periodo: "hoje" });
    expect(m).toContain("2. Digite a senha: 482913");
    expect(m).toContain("SIM ou NÃO");
    const m2 = mensagemConvite({ nome: "", casa: "Casa 1", titulo: "T", link: "L", senha: "1", periodo: "p", condominio: "Outro", modo: "candidatos" });
    expect(m2).toMatch(/^Olá! Votação oficial do Outro/);
    expect(m2).toContain("Escolha seu candidato");
    expect(m).toMatch(/1\. Toque no link/);
    expect(m).toMatch(/^Olá, Ana!/);
    expect(m).toContain("https://x/votar/ABC");
    expect(m).toMatch(/UM voto por casa/);
  });
});

/** Monta um .docx mínimo (zip com word/document.xml) para testar a leitura. */
function docxCom(xml: string, comprimir = true): Buffer {
  const nome = Buffer.from("word/document.xml");
  const bruto = Buffer.from(xml, "utf8");
  const dados = comprimir ? deflateRawSync(bruto) : bruto;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(comprimir ? 8 : 0, 8);
  local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(bruto.length, 22);
  local.writeUInt16LE(nome.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(comprimir ? 8 : 0, 10);
  central.writeUInt32LE(dados.length, 20);
  central.writeUInt32LE(bruto.length, 24);
  central.writeUInt16LE(nome.length, 28);
  central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + nome.length + dados.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + nome.length, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, nome, dados, central, nome, fim]);
}

const celula = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const linha = (...c: string[]) => `<w:tr>${c.map(celula).join("")}</w:tr>`;

describe("lerTabelasDocx", () => {
  it("lê a tabela do Word (comprimida ou não), com acentos e entidades", () => {
    const xml = `<w:document><w:body><w:tbl>${linha("CASA", "NOME", "CONTATOS")}${linha("01", "José &amp; Iza", "(94)991234567")}</w:tbl></w:body></w:document>`;
    for (const comprimir of [true, false]) {
      expect(lerTabelasDocx(docxCom(xml, comprimir))).toEqual([
        [
          ["CASA", "NOME", "CONTATOS"],
          ["01", "José & Iza", "(94)991234567"],
        ],
      ]);
    }
  });
  it("recusa arquivo que não é .docx ou sem tabela", () => {
    expect(() => lerTabelasDocx(Buffer.from("não é zip"))).toThrow(ErroDocx);
    expect(() => lerTabelasDocx(docxCom("<w:document><w:body><w:p/></w:body></w:document>"))).toThrow(/não tem tabela/);
  });
});
