import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  CircleCheck,
  Download,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { adminDb } from "@/server/firebase-admin";
import { consumirTentativa, limiteEstourado } from "@/server/rate-limit";
import {
  cookieDoLink,
  limparCodigo,
  votacaoPorCodigo,
} from "@/server/dados/votacao-links";
import { votarComCodigo } from "@/server/acoes/votacao-links";
import { regraTexto } from "@/lib/eleicoes";
import { diaMes } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";
import { Alerta } from "@/components/ui/basicos";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { classeBotaoFaixa } from "@/components/layout/faixa-topo";
import { FaixaPetalas } from "@/components/ui/painel";
import { Cedula } from "@/components/eleicoes/cedula";
import { ArvoreChapa } from "@/components/eleicoes/arvore-chapa";
import { SenhaLink } from "@/components/eleicoes/senha-link";
import {
  EtiquetaEleicao,
  ListaCandidatos,
  ResultadoEleicao,
} from "@/components/eleicoes/pecas";

export const metadata: Metadata = {
  title: "Votação oficial",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * LINK DE VOTO DA CASA (sem login). O código no endereço diz a casa e a eleição.
 * - Casa ainda não votou e a votação está aberta: mostra a cédula.
 * - Casa já votou (por este ou outro aparelho): "Voto já realizado".
 * - Código inválido/trocado: aviso, com limite de tentativas por endereço.
 */
export default async function VotarPorLink({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo: bruto } = await params;
  let texto = bruto;
  try {
    texto = decodeURIComponent(bruto);
  } catch {
    /* endereço mal escrito: tratado como código inválido */
  }
  const codigo = limparCodigo(texto);
  // Link digitado com minúsculas/traços: vai para o endereço certo (o cookie da senha depende dele).
  if (codigo && codigo !== bruto) redirect(`/votar/${codigo}`);

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido";
  // Quem errou muitos códigos não consegue nem procurar (nem os certos) por um tempo.
  const bloqueado = await limiteEstourado(
    adminDb(),
    "voto.link.invalido",
    ip,
    20,
    10 * 60,
  );
  const senhaHash =
    codigo && !bloqueado
      ? ((await cookies()).get(cookieDoLink(codigo))?.value ?? null)
      : null;
  const v =
    codigo && !bloqueado ? await votacaoPorCodigo(codigo, { senhaHash }) : null;

  if (!v) {
    if (!bloqueado)
      await consumirTentativa(adminDb(), "voto.link.invalido", ip, 20, 10 * 60);
    return (
      <Moldura>
        <Alerta
          tipo="erro"
          titulo={bloqueado ? "Muitas tentativas" : "Link de voto inválido"}
        >
          {bloqueado
            ? "Espere alguns minutos antes de tentar de novo."
            : "Este link não existe ou foi trocado pela comissão. Confira se copiou o link inteiro ou peça um link novo à comissão eleitoral."}
        </Alerta>
      </Moldura>
    );
  }

  const podeVotar = v.situacao === "aberta" && !v.casaVotou && !v.casaBloqueada;

  return (
    <Moldura subtitulo={v.condominioNome}>
      <div className="flex flex-col gap-1.5 text-center">
        <p className="text-[0.82rem] font-bold uppercase tracking-wide text-muted">
          {v.cargo}
        </p>
        <h1 className="text-[1.5rem] font-bold leading-tight text-destaque">
          {v.titulo}
        </h1>
        <p className="text-ink-2">
          <b>{v.casaRotulo}</b> · {regraTexto(v)} · um voto por casa
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <EtiquetaEleicao situacao={v.situacao} />
          <span className="text-[0.9rem] text-muted">
            {v.situacao === "agendada"
              ? `Abre ${formatarDataHora(v.abreEm, v.fuso)}`
              : v.situacao === "aberta"
                ? `Vote até ${formatarDataHora(v.fechaEm, v.fuso)}`
                : `Encerrada ${formatarDataHora(v.fechaEm, v.fuso)}`}
          </span>
        </div>
      </div>

      {v.casaVotou ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-ok-soft p-5 text-center text-pine">
          <CircleCheck aria-hidden className="size-12" />
          <p className="font-display text-[1.35rem] font-extrabold leading-tight">
            Voto já realizado
          </p>
          <p className="text-[0.95rem] text-ink-2">
            O voto da {v.casaRotulo} já foi registrado
            {v.casaVotouEm ? ` em ${diaMes(v.casaVotouEm, v.fuso)}` : ""}. Cada
            casa vota uma vez, e o voto não pode ser mudado.
          </p>
          {v.senhaOk ? (
            <a
              href={`/votar/${v.codigo}/comprovante`}
              download
              className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-full bg-pine px-5 font-bold text-canvas shadow-relevo active:shadow-afundado"
            >
              <Download aria-hidden className="size-5" /> Baixar comprovante
              (PDF)
            </a>
          ) : null}
        </div>
      ) : v.casaBloqueada && v.situacao !== "encerrada" ? (
        <Alerta tipo="aviso" titulo="Sua casa não está liberada para votar">
          A comissão eleitoral bloqueou esta casa nesta eleição. Para saber o
          motivo ou regularizar, fale com a comissão.
        </Alerta>
      ) : v.situacao === "agendada" ? (
        <Alerta tipo="info" titulo="A votação ainda não abriu">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock aria-hidden className="size-4" /> Volte a partir de{" "}
            {formatarDataHora(v.abreEm, v.fuso)} usando este mesmo link.
          </span>
        </Alerta>
      ) : v.situacao === "encerrada" && !v.resultado ? (
        <Alerta tipo="info" titulo="Votação encerrada">
          Os votos estão sendo apurados. O resultado aparece aqui em até 2
          minutos.
        </Alerta>
      ) : v.situacao === "encerrada" ? (
        <Alerta tipo="info" titulo="Votação encerrada">
          Esta casa não votou nesta eleição.
        </Alerta>
      ) : null}

      {v.casaVotou && !v.senhaOk ? (
        <SenhaLink codigo={v.codigo} motivo="comprovante" />
      ) : podeVotar && !v.senhaOk ? (
        <SenhaLink codigo={v.codigo} />
      ) : podeVotar ? (
        <Cedula
          eleicaoId={v.eleicaoId}
          acao={votarComCodigo}
          campos={{ codigo: v.codigo }}
          modo={v.modo}
          candidatos={v.candidatos}
          escolhasPorCasa={v.escolhasPorCasa}
          permiteBranco={v.permiteBranco}
          fotos={v.fotos}
        />
      ) : v.resultado ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold">Resultado final</h2>
          <ResultadoEleicao apuracao={v.resultado.apuracao} vagas={v.vagas} />
          {v.modo === "chapa" ? (
            <ArvoreChapa candidatos={v.candidatos} fotos={v.fotos} />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold">
            {v.modo === "chapa" ? "Integrantes da chapa" : "Candidatos"}
          </h2>
          {v.modo === "chapa" ? (
            <ArvoreChapa candidatos={v.candidatos} fotos={v.fotos} />
          ) : (
            <ListaCandidatos candidatos={v.candidatos} />
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-[0.88rem] text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pine" />
        <span>
          <b className="text-ink-2">Voto secreto:</b> o portal registra só que a
          casa votou; o voto de cada casa não fica guardado em lugar nenhum — só
          a soma dos votos, que aparece depois do encerramento. Este link é só
          da sua casa: não repasse.
        </span>
      </p>
    </Moldura>
  );
}

function Moldura({
  children,
  subtitulo,
}: {
  children: React.ReactNode;
  subtitulo?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="relative overflow-hidden bg-band pb-28 pt-[env(safe-area-inset-top)] text-band-fg">
        <Petalas
          tamanho={260}
          className="absolute -right-16 -top-20 opacity-20"
        />
        <div className="relative mx-auto flex max-w-lg items-center gap-3 px-4 pt-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[0.82rem] text-band-muted">
            <Lock aria-hidden className="size-3.5" /> Votação oficial
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
