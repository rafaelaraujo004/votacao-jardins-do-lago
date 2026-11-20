/**
 * Notificações no celular (Web Push): validação da inscrição, mensagem montada e
 * quando a inscrição deve ser apagada.
 */
import { describe, expect, it } from "vitest";
import { emPedacos, esquemaInscricao, inscricaoExpirou, montarMensagem } from "@/lib/push";

const VALIDA = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

describe("esquemaInscricao", () => {
  it("aceita a inscrição que o navegador entrega", () => {
    expect(esquemaInscricao.safeParse(VALIDA).success).toBe(true);
  });

  it("recusa endereço sem https, com usuário/senha ou chaves estranhas", () => {
    expect(esquemaInscricao.safeParse({ ...VALIDA, endpoint: "http://fcm.googleapis.com/x" }).success).toBe(false);
    expect(esquemaInscricao.safeParse({ ...VALIDA, endpoint: "https://a:b@exemplo.com/x" }).success).toBe(false);
    expect(esquemaInscricao.safeParse({ ...VALIDA, endpoint: "javascript:alert(1)" }).success).toBe(false);
    expect(esquemaInscricao.safeParse({ ...VALIDA, keys: { p256dh: "<script>", auth: "x" } }).success).toBe(false);
    expect(esquemaInscricao.safeParse({ endpoint: VALIDA.endpoint }).success).toBe(false);
  });
});

describe("montarMensagem", () => {
  it("corta textos longos numa palavra inteira", () => {
    const m = montarMensagem({ titulo: "Novo comunicado", texto: "palavra ".repeat(60), url: "/comunicados/abc" });
    expect(m.texto.length).toBeLessThanOrEqual(180);
    expect(m.texto.endsWith("…")).toBe(true);
  });

  it("o link é sempre interno (nada de levar para outro site)", () => {
    expect(montarMensagem({ titulo: "x", texto: "y", url: "https://golpe.exemplo.com" }).url).toBe("/");
    expect(montarMensagem({ titulo: "x", texto: "y", url: "//golpe.exemplo.com" }).url).toBe("/");
    expect(montarMensagem({ titulo: "x", texto: "y", url: "/reservas" }).url).toBe("/reservas");
  });

  it("título vazio vira o nome do condomínio", () => {
    expect(montarMensagem({ titulo: "  ", texto: "y", url: "/" }).titulo).toBe("Jardins do Lago");
  });
});

describe("apoio", () => {
  it("divide listas em pedaços de até 30 (limite do Firestore)", () => {
    const pedacos = emPedacos(Array.from({ length: 65 }, (_, i) => i));
    expect(pedacos.map((p) => p.length)).toEqual([30, 30, 5]);
  });

  it("apaga a inscrição só quando o serviço diz que ela não existe mais", () => {
    expect(inscricaoExpirou(404)).toBe(true);
    expect(inscricaoExpirou(410)).toBe(true);
    expect(inscricaoExpirou(500)).toBe(false);
    expect(inscricaoExpirou(undefined)).toBe(false);
  });
});
