/**
 * Links dos módulos: cada link leva cada perfil para a versão certa do módulo.
 */
import { describe, expect, it } from "vitest";
import {
  abaDaEntrada,
  destinoDoModulo,
  linkDoModulo,
  mensagemDoModulo,
  moduloDoCaminho,
  moduloPeloLink,
  MODULOS,
  telaEquivalente,
} from "@/lib/modulos";
import { calcularPermissoes, type Papel } from "@/lib/permissoes";

const perm = (papel: Papel, negadas: string[] = []) => calcularPermissoes(papel, [], negadas);

describe("lista de módulos", () => {
  it("links únicos, curtos e começando com /", () => {
    const links = MODULOS.map((m) => m.link);
    expect(new Set(links).size).toBe(links.length);
    for (const l of links) expect(l).toMatch(/^\/[a-z]+$/);
    const chaves = MODULOS.map((m) => m.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("tem os módulos pedidos: síndico, conselho, portaria, morador e reservas", () => {
    for (const l of ["/sindico", "/conselho", "/portaria", "/morador", "/reservas"]) {
      expect(moduloPeloLink(l), l).not.toBeNull();
    }
  });

  it("todo destino é permitido pelo perfil padrão da área (ninguém cai em 'sem acesso' por padrão)", () => {
    const papeis: Record<string, Papel[]> = { morador: ["morador"], portaria: ["portaria"], gestao: ["admin"] };
    for (const m of MODULOS) {
      for (const [area, destino] of Object.entries(m.destinos)) {
        for (const papel of papeis[area]) {
          expect(perm(papel).has(destino.permissao), `${m.chave} → ${papel}`).toBe(true);
        }
      }
    }
  });
});

describe("moduloDoCaminho", () => {
  it("acha o módulo pelo link, pelas telas e pelas subpáginas", () => {
    expect(moduloDoCaminho("/reservas")?.chave).toBe("reservas");
    expect(moduloDoCaminho("/admin/reservas/areas/nova")?.chave).toBe("reservas");
    expect(moduloDoCaminho("/visitas")?.chave).toBe("visitas");
    expect(moduloDoCaminho("/encomendas")?.chave).toBe("encomendas");
    expect(moduloDoCaminho("/portaria")?.chave).toBe("portaria");
    expect(moduloDoCaminho("/admin/portaria")?.chave).toBe("portaria");
    expect(moduloDoCaminho("/inicio")?.chave).toBe("morador");
    expect(moduloDoCaminho("/mais")?.chave).toBe("morador");
    expect(moduloDoCaminho("/admin")?.chave).toBe("sindico");
    expect(moduloDoCaminho("/comunicados/abc")?.chave).toBe("comunicados");
  });

  it("telas sem módulo ficam de fora", () => {
    expect(moduloDoCaminho("/admin/auditoria")).toBeNull();
    expect(moduloDoCaminho("/admin/pessoas")).toBeNull();
    expect(moduloDoCaminho("/conta/senha")).toBeNull();
    expect(moduloDoCaminho("/reservasx")).toBeNull();
    expect(moduloDoCaminho("/")).toBeNull();
  });
});

describe("destinoDoModulo", () => {
  const reservas = moduloPeloLink("/reservas")!;
  const sindico = moduloPeloLink("/sindico")!;
  const portaria = moduloPeloLink("/portaria")!;
  const enquetes = moduloPeloLink("/enquetes")!;

  it("cada perfil vai para a sua versão do módulo", () => {
    expect(destinoDoModulo(reservas, "morador", perm("morador"))).toBe("/reservas");
    expect(destinoDoModulo(reservas, "admin", perm("admin"))).toBe("/admin/reservas");
    expect(destinoDoModulo(reservas, "conselheiro", perm("conselheiro"))).toBe("/admin/reservas");
    expect(destinoDoModulo(reservas, "portaria", perm("portaria"))).toBe("/portaria");
    expect(destinoDoModulo(portaria, "portaria", perm("portaria"))).toBe("/portaria");
    expect(destinoDoModulo(portaria, "admin", perm("admin"))).toBe("/admin/portaria");
    expect(destinoDoModulo(portaria, "morador", perm("morador"))).toBe("/visitas");
  });

  it("sem versão para o perfil ou sem a permissão → null", () => {
    expect(destinoDoModulo(sindico, "morador", perm("morador"))).toBeNull();
    expect(destinoDoModulo(sindico, "portaria", perm("portaria"))).toBeNull();
    // O conselho não cria enquetes: o link de enquetes não tem versão para ele.
    expect(destinoDoModulo(enquetes, "conselheiro", perm("conselheiro"))).toBeNull();
    // Permissão retirada pelo síndico também vale.
    expect(destinoDoModulo(reservas, "admin", perm("admin", ["reservas.ver_todas"]))).toBeNull();
  });
});

describe("telaEquivalente", () => {
  it("leva quem abriu a tela de outra área para a sua versão", () => {
    expect(telaEquivalente("/reservas", "admin", perm("admin"))).toBe("/admin/reservas");
    expect(telaEquivalente("/inicio", "admin", perm("admin"))).toBe("/admin");
    expect(telaEquivalente("/admin/financeiro", "morador", perm("morador"))).toBe("/financeiro");
    expect(telaEquivalente("/visitas", "portaria", perm("portaria"))).toBe("/portaria");
    expect(telaEquivalente("/portaria", "morador", perm("morador"))).toBe("/visitas");
    // O conselho não vê o histórico da portaria: sem versão para ele (vai para "sem acesso").
    expect(telaEquivalente("/portaria", "conselheiro", perm("conselheiro"))).toBeNull();
    expect(telaEquivalente("/classificados/moderar", "admin", perm("admin"))).toBe("/admin/classificados");
  });

  it("leva o item junto só nas telas de detalhe com o mesmo formato", () => {
    expect(telaEquivalente("/comunicados/abc", "admin", perm("admin"))).toBe("/admin/comunicados/abc");
    expect(telaEquivalente("/admin/enquetes/e1", "morador", perm("morador"))).toBe("/enquetes/e1");
    expect(telaEquivalente("/admin/enquetes/nova", "morador", perm("morador"))).toBe("/enquetes");
    expect(telaEquivalente("/admin/enquetes/e1/editar", "morador", perm("morador"))).toBe("/enquetes");
  });

  it("já está na tela certa, ou não há versão → null (sem laço de redirecionamento)", () => {
    expect(telaEquivalente("/reservas", "morador", perm("morador"))).toBeNull();
    expect(telaEquivalente("/admin/reservas/areas", "admin", perm("admin"))).toBeNull();
    expect(telaEquivalente("/mapa", "admin", perm("admin"))).toBeNull();
    expect(telaEquivalente("/admin/auditoria", "morador", perm("morador"))).toBeNull();
    expect(telaEquivalente("/financeiro", "portaria", perm("portaria"))).toBeNull();
  });

  it("o destino nunca manda de volta (nada de ir e voltar entre duas telas)", () => {
    const papeis: Papel[] = ["morador", "portaria", "admin", "conselheiro"];
    const caminhos = MODULOS.flatMap((m) => [m.link, ...Object.values(m.destinos).map((d) => d.href)]);
    for (const papel of papeis) {
      for (const c of caminhos) {
        const destino = telaEquivalente(c, papel, perm(papel));
        if (destino) expect(telaEquivalente(destino, papel, perm(papel)), `${papel}: ${c} → ${destino}`).toBeNull();
      }
    }
  });
});

describe("tela de entrada", () => {
  it("links da equipe já abrem na aba da equipe", () => {
    for (const c of ["/sindico", "/conselho", "/portaria", "/admin", "/admin/reservas"]) expect(abaDaEntrada(c), c).toBe("equipe");
    for (const c of ["", "/morador", "/reservas", "/visitas", "/inicio", "/financeiro"]) expect(abaDaEntrada(c), c).toBe("morador");
  });
});

describe("link para mandar", () => {
  const reservas = moduloPeloLink("/reservas")!;

  it("monta o endereço completo, com ?c= só fora do condomínio padrão", () => {
    expect(linkDoModulo("https://portal.com/", reservas, "jardins", "jardins")).toBe("https://portal.com/reservas");
    expect(linkDoModulo("https://portal.com", reservas, "demo", "jardins")).toBe("https://portal.com/reservas?c=demo");
  });

  it("mensagem do WhatsApp tem o nome, o link e o aviso da senha", () => {
    const texto = mensagemDoModulo("Jardins do Lago", reservas, "https://portal.com/reservas");
    expect(texto).toContain("Reservas");
    expect(texto).toContain("https://portal.com/reservas");
    expect(texto).toContain("senha");
  });
});
