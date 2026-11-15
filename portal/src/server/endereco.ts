import "server-only";
import { headers } from "next/headers";

// Endereço usado se o pedido vier sem um "host" confiável.
const ENDERECO_RESERVA = "https://portal-jardins-do-lago.vercel.app";

/** Endereço base do portal a partir do próprio pedido (ex.: https://portal.exemplo.com). */
export async function enderecoBase(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return ENDERECO_RESERVA;
  const protoBruto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = protoBruto === "http" || protoBruto === "https" ? protoBruto : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
