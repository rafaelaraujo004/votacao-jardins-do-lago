import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FilePen, Lock, ShieldCheck } from "lucide-react";
import { adminDb } from "@/server/firebase-admin";
import {
  ataPorCodigo,
  contarCodigoInvalidoAta,
  ipBarradoAta,
} from "@/server/dados/assinaturas-ata";
import { limparCodigo } from "@/server/dados/votacao-links";
import { assinarAtaPorCodigo } from "@/server/acoes/assinaturas-ata";
import { Alerta } from "@/components/ui/basicos";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { classeBotaoFaixa } from "@/components/layout/faixa-topo";
import { FaixaPetalas } from "@/components/ui/painel";
import { AssinaturaPorLink } from "@/components/eleicoes/quadro-assinatura";

export const dynamic = "force-dynamic";

const DESCRICAO = "Confira o resultado da votação e assine a ata com o dedo.";

/**
 * Prévia do link no WhatsApp: só textos genéricos (a prévia aparece para quem vê a conversa).
 * Fora dos buscadores (noindex).
 */
export const metadata: Metadata = {
  title: { absolute: "Assinar a ata da votação" },
  description: DESCRICAO,
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "pt_BR", title: "Assinar a ata da votação", description: DESCRICAO },
};

/** Código do endereço, já limpo (null se não parece um código). */
function codigoDoEndereco(bruto: string): string | null {
  let texto = bruto;
  try {
    texto = decodeURIComponent(bruto);
  } catch {
    /* endereço mal escrito: tratado como código inválido */
  }
  return limparCodigo(texto);
}

/**
 * LINK PARA ASSINAR A ATA da votação (sem login), mandado pela comissão no WhatsApp.
 * O código no endereço diz a votação e a parte da ata (ex.: Testemunha). A pessoa confere o
 * resultado, escreve o nome completo e assina com o dedo. O link vale UMA vez.
 * - Código que não existe, já usado ou trocado: aviso simples, contando no limite por endereço
 *   (só os errados contam; código certo nunca é barrado).
 * - Depois de assinar, a própria tela mostra "Assinatura registrada" (sem recarregar).
 */
export default async function AssinarAtaPorLink({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo: bruto } = await params;
  const codigo = codigoDoEndereco(bruto);
  // Link com minúsculas ou traços: vai para o endereço certo.
  if (codigo && codigo !== bruto) redirect(`/assinar-ata/${codigo}`);

  const v = codigo ? await ataPorCodigo(codigo) : null;

  if (!v) {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
    const db = adminDb();
    const bloqueado = await ipBarradoAta(db, ip);
    if (!bloqueado) await contarCodigoInvalidoAta(db, ip);
    return (
      <Moldura>
        <Alerta tipo="erro" titulo={bloqueado ? "Muitas tentativas" : "Link de assinatura inválido"}>
          {bloqueado
            ? "Espere alguns minutos antes de tentar de novo."
            : "Este link não existe, já foi usado ou foi trocado pela comissão. Se você ainda não assinou, peça um link novo à comissão eleitoral."}
        </Alerta>
      </Moldura>
    );
  }

  return (
    <Moldura subtitulo={v.condominioNome}>
      <div className="flex flex-col gap-1.5 text-center">
        <p className="text-[0.82rem] font-bold uppercase tracking-wide text-muted">Ata da votação</p>
        <h1 className="text-[1.5rem] font-bold leading-tight text-destaque">{v.titulo}</h1>
        <p className="text-ink-2">{v.cargo}</p>
      </div>

      <section aria-labelledby="resultado-ata" className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-4">
        <h2 id="resultado-ata" className="text-[0.9rem] font-bold uppercase tracking-wide text-muted">
          Resultado
        </h2>
        <p className="text-[1.05rem]">
          <b className="text-destaque">{v.resultado}</b> · {v.numeros} · Participação {v.participacao}% ({v.votaram} de{" "}
          {v.casasAptas} {v.casasAptas === 1 ? "casa" : "casas"})
        </p>
      </section>

      <p className="flex items-center justify-center gap-2 text-center text-[1.05rem]">
        <FilePen aria-hidden className="size-5 shrink-0 text-pine" />
        <span>
          Você assina como: <b>{v.papel}</b>
        </span>
      </p>

      <AssinaturaPorLink codigo={v.codigo} papel={v.papel} acao={assinarAtaPorCodigo} />

      <p className="flex items-start gap-2 text-[0.88rem] text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
        <span>
          Este link é só seu e vale uma vez: depois de assinar, ele para de funcionar. A assinatura aparece na
          ata da votação guardada pela comissão eleitoral.
        </span>
      </p>
    </Moldura>
  );
}

/** Mesmo visual da página do link de voto (faixa verde, cartão com pétalas e a logo). */
function Moldura({ children, subtitulo }: { children: React.ReactNode; subtitulo?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="relative overflow-hidden bg-band pb-28 pt-[env(safe-area-inset-top)] text-band-fg">
        <Petalas tamanho={260} className="absolute -right-16 -top-20 opacity-20" />
        <div className="relative mx-auto flex max-w-lg items-center gap-3 px-4 pt-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[0.82rem] text-band-muted">
            <Lock aria-hidden className="size-3.5" /> Ata da votação
            {subtitulo ? ` · ${subtitulo}` : ""}
          </p>
          <BotaoTema className={classeBotaoFaixa} />
        </div>
      </div>
      <main className="relative mx-auto -mt-24 w-full max-w-lg flex-1 px-3 pb-10">
        <div className="surgir overflow-hidden rounded-[26px] border border-borda-luz bg-surface shadow-float">
          <FaixaPetalas />
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex justify-center">
              <Logo largura={130} />
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
