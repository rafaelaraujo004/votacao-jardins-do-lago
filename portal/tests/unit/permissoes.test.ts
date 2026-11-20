import { describe, expect, it } from "vitest";
import { calcularPermissoes, inicioDoPapel, PERMISSOES } from "@/lib/permissoes";

describe("matriz de permissões", () => {
  it("admin tem todas as permissões", () => {
    expect(calcularPermissoes("admin").size).toBe(PERMISSOES.length);
  });

  it("morador não entra na gestão nem na portaria e não vê o financeiro interno", () => {
    const p = calcularPermissoes("morador");
    expect(p.has("area.morador")).toBe(true);
    expect(p.has("area.gestao")).toBe(false);
    expect(p.has("area.portaria")).toBe(false);
    expect(p.has("financeiro.ver")).toBe(false);
    expect(p.has("financeiro.ver_publicado")).toBe(true);
  });

  it("portaria nunca recebe nada do financeiro, auditoria ou permissões, mesmo se concedido", () => {
    const p = calcularPermissoes("portaria", ["financeiro.ver", "financeiro.lancar", "auditoria.ver", "permissoes.gerenciar"]);
    expect([...p].filter((x) => x.startsWith("financeiro"))).toEqual([]);
    expect(p.has("auditoria.ver")).toBe(false);
    expect(p.has("permissoes.gerenciar")).toBe(false);
  });

  it("conselheiro é só consulta por padrão e pode receber extras permitidos", () => {
    const padrao = calcularPermissoes("conselheiro");
    expect(padrao.has("financeiro.ver")).toBe(true);
    expect(padrao.has("financeiro.lancar")).toBe(false);
    expect(padrao.has("auditoria.ver")).toBe(false);
    expect(calcularPermissoes("conselheiro", ["auditoria.ver"]).has("auditoria.ver")).toBe(true);
    expect(calcularPermissoes("conselheiro", ["financeiro.lancar"]).has("financeiro.lancar")).toBe(false);
  });

  it("retirada sempre vence, inclusive sobre o padrão", () => {
    const p = calcularPermissoes("admin", [], ["financeiro.lancar"]);
    expect(p.has("financeiro.lancar")).toBe(false);
    expect(calcularPermissoes("conselheiro", ["auditoria.ver"], ["auditoria.ver"]).has("auditoria.ver")).toBe(false);
  });

  it("ignora valores desconhecidos vindos do banco", () => {
    const p = calcularPermissoes("morador", ["tudo", 42, null], ["???"]);
    expect(p).toEqual(calcularPermissoes("morador"));
  });

  it("cada papel tem sua tela inicial", () => {
    expect(inicioDoPapel("morador")).toBe("/inicio");
    expect(inicioDoPapel("portaria")).toBe("/portaria");
    expect(inicioDoPapel("admin")).toBe("/admin");
    expect(inicioDoPapel("conselheiro")).toBe("/admin");
    expect(inicioDoPapel("reservas")).toBe("/admin/reservas");
  });

  it("responsável pelas reservas só vê e decide reservas (nada de financeiro, pessoas ou auditoria)", () => {
    const p = calcularPermissoes("reservas");
    expect([...p].sort()).toEqual(["area.gestao", "reservas.gerenciar", "reservas.ver_todas"]);
    expect(calcularPermissoes("reservas", ["areas.configurar"]).has("areas.configurar")).toBe(true);
    expect(calcularPermissoes("reservas", ["financeiro.ver", "moradores.ver"]).has("financeiro.ver")).toBe(false);
  });
});
