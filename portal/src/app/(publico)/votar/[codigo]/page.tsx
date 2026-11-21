import type { Metadata } from "next";
import { cache } from "react";
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
import {
  LIMITE_IP,
  contarErroDoIp,
  cookieDoLink,
  ipEstourado,
  limparCodigo,
  painelPorCodigo,
  votacaoPorCodigo,
} from "@/server/dados/votacao-links";
import { votarComCodigo } from "@/server/acoes/votacao-links";
import { enderecoBase } from "@/server/endereco";
import { regraTexto, resultadoParaPainel } from "@/lib/eleicoes";
import { ALTURA_GUIA, CAPA_GUIA, LARGURA_GUIA } from "@/lib/guia-votacao";
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
import { GuiaComoVotar } from "@/components/eleicoes/guia-como-votar";
import { RevelacaoResultado } from "@/components/eleicoes/revelacao-resultado";
import { PainelEleicaoVivo } from "@/components/eleicoes/painel-destaque";
import {
  EtiquetaEleicao,
  ListaCandidatos,
  ResultadoEleicao,
} from "@/components/eleicoes/pecas";

export const dynamic = "force-dynamic";

const DESCRICAO =
  "Toque no link, digite a senha da sua casa e vote. Veja o passo a passo com imagens.";

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

/** Lê a votação do link UMA vez por pedido (a prévia do WhatsApp e a página usam a mesma leitura). */
const lerVotacao = cache(async (codigo: string) => {
  const token = (await cookies()).get(cookieDoLink(codigo))?.value ?? null;
  return votacaoPorCodigo(codigo, { token });
});

/**
 * Prévia do link no WhatsApp: título genérico, a capa do passo a passo (endereço completo,
 * o WhatsApp não entende caminho relativo) e uma frase de ajuda.
 * NUNCA a casa nem a senha: a prévia aparece para qualquer pessoa que vê a conversa.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo: bruto } = await params;
  const codigo = codigoDoEndereco(bruto);
  // Endereço fora do formato: a página redireciona; não precisa ler nada.
  const v = codigo && codigo === bruto ? await lerVotacao(codigo) : null;
  const titulo = `Votação oficial — ${v?.condominioNome || "Residencial Jardins do Lago"}`;
  const capa = `${await enderecoBase()}${CAPA_GUIA.src}`;
  return {
    title: { absolute: titulo },
    description: DESCRICAO,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      title: titulo,
      description: DESCRICAO,
      images: [
        {
          url: capa,
          width: LARGURA_GUIA,
          height: ALTURA_GUIA,
          alt: CAPA_GUIA.alt,
        },
      ],
    },
  };
}

/**
 * LINK DE VOTO DA CASA (sem login). O código no endereço diz a casa e a eleição.
 * - Casa ainda não votou e a votação está aberta: mostra a cédula.
 * - Casa já votou (por este ou outro aparelho): "Voto já realizado".
 * - Código inválido/trocado: aviso, com limite de tentativas por endereço.
 * - PAINEL AO VIVO (pedido de 21/11/2026): quem só tem o link também acompanha quantas casas
 *   já votaram e quantas faltam e, no fim, o resultado com a animação — só números do
 *   condomínio inteiro, nunca quais casas. Fica abaixo da senha/cédula enquanto a casa pode
 *   votar (votar vem primeiro) e logo abaixo do cabeçalho nos outros casos.
 */
export default async function VotarPorLink({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo: bruto } = await params;
  const codigo = codigoDoEndereco(bruto);
  // Link digitado com minúsculas/traços: vai para o endereço certo (o cookie da senha depende dele).
  if (codigo && codigo !== bruto) redirect(`/votar/${codigo}`);

  // Link certo sempre abre (muitas casas abrem o link atrás do mesmo endereço de internet).
  // Só links INVÁLIDOS contam no limite do endereço, e só eles são barrados.
  const v = codigo ? await lerVotacao(codigo) : null;

  if (!v) {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
    const bloqueado = await ipEstourado(adminDb(), LIMITE_IP.linkInvalido, ip);
    if (!bloqueado) await contarErroDoIp(adminDb(), LIMITE_IP.linkInvalido, ip);
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
  // Painel ao vivo (números do condomínio inteiro). Se falhar, a página abre sem ele.
  let aoVivo: Awaited<ReturnType<typeof painelPorCodigo>> = null;
  try {
    aoVivo = await painelPorCodigo(v.codigo);
  } catch (erro) {
    console.error("Link de voto: não foi possível montar o painel ao vivo", erro);
  }
  const painelVivo = aoVivo ? (
    <PainelEleicaoVivo
      inicial={aoVivo.painel}
      casaInicial={aoVivo.casa}
      hrefDetalhe={null}
      perfil="link"
      agoraServidor={aoVivo.painel.geradoEm}
      fuso={v.fuso}
      endereco={`/api/votar/${v.codigo}/painel`}
      intervaloSegundos={30}
      atualizarPaginaNaVirada
    />
  ) : null;
  // Passo a passo com imagens: na hora de votar e enquanto a votação não abre.
  const mostrarGuia =
    podeVotar ||
    (v.situacao === "agendada" && !v.casaVotou && !v.casaBloqueada);

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

      {podeVotar ? null : painelVivo}

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

      {/* Casa que já votou: senha para o comprovante (e, depois do encerramento, o resultado abaixo). */}
      {v.casaVotou && !v.senhaOk ? (
        <SenhaLink codigo={v.codigo} motivo="comprovante" />
      ) : null}

      {podeVotar && !v.senhaOk ? (
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
      ) : v.resultado && painelVivo ? (
        // O resultado (gráfico, regra, revelação) está no painel ao vivo, lá em cima.
        v.modo === "chapa" ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-bold">Integrantes da chapa</h2>
            <ArvoreChapa candidatos={v.candidatos} fotos={v.fotos} />
          </div>
        ) : null
      ) : v.resultado ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-bold">Resultado final</h2>
          <RevelacaoResultado
            eleicaoId={v.eleicaoId}
            titulo={v.titulo}
            resultado={resultadoParaPainel(v.resultado.apuracao)}
            casasAptas={v.resultado.casasAptas}
            votaram={v.resultado.votaram}
          />
          <ResultadoEleicao apuracao={v.resultado.apuracao} vagas={v.vagas} />
          {v.modo === "chapa" ? (
            <ArvoreChapa candidatos={v.candidatos} fotos={v.fotos} />
          ) : null}
        </div>
      ) : v.casaVotou && !v.senhaOk ? null : (
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

      {podeVotar ? painelVivo : null}

      {mostrarGuia ? <GuiaComoVotar /> : null}

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
