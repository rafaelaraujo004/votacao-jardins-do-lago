import "server-only";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import type { Contexto } from "../contexto";
import { paraEleicao } from "./eleicoes";
import { podeSerResponsavel } from "./reservas";
import { paraEnquete } from "./enquetes";
import { documentosVisiveis } from "./documentos";
import { situacaoEleicao } from "@/lib/eleicoes";
import { situacaoEnquete } from "@/lib/enquetes";
import { ehStatusClassificado } from "@/lib/classificados";
import { ROTULO_CATEGORIA as CATEGORIA_SOLICITACAO, ROTULO_STATUS_SOLICITACAO, ehStatusSolicitacao } from "@/lib/solicitacoes";
import { dataISOParaBR, formatarDataHora, hojeISO } from "@/lib/formato";
import { dentroDaJanela, montarLista, type Notificacao } from "@/lib/notificacoes";

/**
 * Dados do SINO (veja src/lib/notificacoes.ts).
 *
 * A lista é montada na hora, a partir do que já existe no banco, só com o que o
 * perfil da pessoa pode ver:
 * - quem aprova (síndico ou quem recebeu a permissão): anúncios aguardando,
 *   reservas pendentes e solicitações abertas;
 * - morador: votação oficial, enquetes abertas, comunicados e documentos novos e as
 *   respostas aos pedidos da PRÓPRIA casa (anúncios, reservas, solicitações);
 * - portaria: visitas autorizadas pelos moradores (que ainda valem) e comunicados.
 * Pedidos de reserva vão para o RESPONSÁVEL da área (ou o síndico, se a área não tiver).
 * Cada parte é lida separadamente: se uma falhar, o sino continua com as outras.
 * Consultas de um campo só (não precisam de índice composto).
 */

const base = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId);
const data = (v: unknown): Date | null => (v as Timestamp | undefined)?.toDate?.() ?? null;
const texto = (v: unknown, padrao = ""): string => (typeof v === "string" ? v : padrao);
const ms = (d: Date | null, padrao = 0) => d?.getTime() ?? padrao;

/** Teto de leitura de cada consulta (um condomínio pequeno fica bem abaixo). */
const LIMITE = 100;

async function semFalhar(nome: string, ler: () => Promise<Notificacao[]>): Promise<Notificacao[]> {
  try {
    return await ler();
  } catch (erro) {
    console.error(`Sino: não foi possível ler ${nome}`, erro);
    return [];
  }
}

// ---------- Quem aprova ----------

async function anunciosAguardando(ctx: Contexto): Promise<Notificacao[]> {
  const snap = await base(ctx).collection("classifieds").where("status", "==", "pendente").limit(LIMITE).get();
  const tela = ctx.permissoes.has("area.gestao") ? "/admin/classificados" : "/classificados/moderar";
  return snap.docs.map((d) => ({
    id: `anuncio-pendente:${d.id}`,
    tipo: "anuncio_pendente",
    titulo: "Anúncio para aprovar",
    texto: `“${texto(d.get("titulo"), "Anúncio")}” · por ${texto(d.get("autorPrimeiroNome"), "um morador")}`,
    href: tela,
    quando: ms(data(d.get("criadoEm"))),
    acao: true,
    tom: "aviso",
  }));
}

/**
 * Pedidos de reserva aguardando: cada um vai para o RESPONSÁVEL da área (escolhido pelo
 * síndico na configuração da área). Área sem responsável — ou com responsável suspenso
 * ou sem permissão — vai para o síndico.
 */
async function reservasPendentes(ctx: Contexto): Promise<Notificacao[]> {
  const [snap, areas] = await Promise.all([
    base(ctx).collection("reservations").where("status", "==", "pendente").limit(LIMITE).get(),
    base(ctx).collection("amenities").select("responsavelUid").get(),
  ]);
  if (snap.empty) return [];
  const responsavelDaArea = new Map<string, string>();
  for (const a of areas.docs) {
    const uid = a.get("responsavelUid");
    if (typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid)) responsavelDaArea.set(a.id, uid);
  }
  // Confere se cada responsável ainda pode aprovar (acesso ativo e permissão).
  const uids = [...new Set(responsavelDaArea.values())];
  const membros = uids.length ? await adminDb().getAll(...uids.map((uid) => base(ctx).collection("members").doc(uid))) : [];
  const validos = new Set(membros.filter((m) => podeSerResponsavel(m.data())).map((m) => m.id));
  const ehParaMim = (areaId: string) => {
    const uid = responsavelDaArea.get(areaId);
    return uid && validos.has(uid) ? uid === ctx.uid : ctx.papel === "admin";
  };
  return snap.docs.filter((d) => ehParaMim(texto(d.get("amenityId")))).map((d) => {
    const dia = texto(d.get("data"));
    return {
      id: `reserva-pendente:${d.id}`,
      tipo: "reserva_pendente",
      titulo: "Reserva para aprovar",
      texto: [
        texto(d.get("areaNome"), "Área"),
        dia ? `${dataISOParaBR(dia)} ${texto(d.get("inicio"))}–${texto(d.get("fim"))}` : "",
        texto(d.get("unidadeRotulo")),
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/admin/reservas",
      quando: ms(data(d.get("criadoEm"))),
      acao: true,
      tom: "aviso",
    };
  });
}

async function solicitacoesAbertas(ctx: Contexto): Promise<Notificacao[]> {
  const snap = await base(ctx).collection("tickets").where("status", "==", "aberta").limit(LIMITE).get();
  return snap.docs.map((d) => {
    const categoria = d.get("categoria") as keyof typeof CATEGORIA_SOLICITACAO;
    return {
      id: `solicitacao-aberta:${d.id}`,
      tipo: "solicitacao_aberta",
      titulo: `Solicitação ${texto(d.get("protocolo"), "nova")}`,
      texto: [CATEGORIA_SOLICITACAO[categoria] ?? "Outro assunto", texto(d.get("unidadeRotulo"))].filter(Boolean).join(" · "),
      href: `/admin/solicitacoes/${d.id}`,
      quando: ms(data(d.get("criadoEm"))),
      acao: true,
      tom: "info",
    };
  });
}

// ---------- Morador: o condomínio informa ou pede participação ----------

async function votacaoOficial(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  // Consulta leve: sem as fotos da chapa nem a apuração.
  const snap = await base(ctx).collection("elections").where("status", "==", "publicada").limit(20).get();
  const lista: Notificacao[] = [];
  for (const d of snap.docs) {
    const e = paraEleicao(d.id, d.data());
    const situacao = situacaoEleicao(e, agora);
    const href = `/votacao/${e.id}`;
    if (situacao === "agendada") {
      lista.push({
        id: `votacao:${e.id}:agendada`,
        tipo: "votacao",
        titulo: "Votação oficial marcada",
        texto: `${e.titulo}: abre ${formatarDataHora(e.abreEm, ctx.fuso)}. Conheça a chapa.`,
        href,
        quando: ms(e.publicadaEm ?? e.criadoEm),
        acao: false,
        tom: "info",
      });
    } else if (situacao === "aberta") {
      const bloqueada = !!ctx.unitId && e.casasBloqueadas.includes(ctx.unitId);
      const votou = ctx.unitId ? (await d.ref.collection("votantes").doc(ctx.unitId).get()).exists : false;
      lista.push({
        id: `votacao:${e.id}:aberta`,
        tipo: "votacao",
        titulo: votou ? "Votação oficial aberta" : "Votação oficial aberta: vote agora",
        texto: votou
          ? `${e.titulo}: sua casa já votou. O resultado sai no encerramento.`
          : bloqueada
            ? `${e.titulo}: sua casa não está liberada para votar. Fale com a comissão.`
            : `${e.titulo}: vote até ${formatarDataHora(e.fechaEm, ctx.fuso)}. Um voto por casa, secreto.`,
        href,
        quando: Math.max(ms(e.abreEm), ms(e.publicadaEm)),
        acao: !votou && !bloqueada && !!ctx.unitId,
        tom: "destaque",
      });
    } else if (situacao === "encerrada" && dentroDaJanela(e.fechaEm, agora, 7)) {
      const final = resultadoFinalDe(d.data());
      lista.push(
        final && e.resultadoDivulgadoEm
          ? {
              id: `votacao:${e.id}:resultado`,
              tipo: "votacao",
              titulo: `Resultado da votação: ${final.titulo}`,
              texto: `${e.titulo}: ${final.numeros}.`,
              href,
              quando: ms(e.resultadoDivulgadoEm),
              acao: false,
              tom: final.eleita === false ? "neutro" : "ok",
            }
          : {
              id: `votacao:${e.id}:encerrada`,
              tipo: "votacao",
              titulo: "Votação oficial encerrada",
              texto: `${e.titulo}: veja o resultado.`,
              href,
              quando: ms(e.fechaEm),
              acao: false,
              tom: "neutro",
            },
      );
    }
  }
  return lista;
}

/** Resumo do resultado gravado na divulgação (finalizarEleicao). */
function resultadoFinalDe(d: DocumentData | undefined): { titulo: string; numeros: string; eleita: boolean | null } | null {
  const r = d?.resultadoFinal;
  // Divulgada sem aviso (eleição antiga): não entra no sino.
  if (!r || typeof r !== "object" || typeof r.titulo !== "string" || r.semAviso === true) return null;
  return { titulo: r.titulo, numeros: texto(r.numeros), eleita: typeof r.eleita === "boolean" ? r.eleita : null };
}

/**
 * Equipe (síndico, conselho, portaria, reservas): o RESULTADO da votação oficial também chega
 * no sino de todos, nos 7 dias depois da divulgação. A comissão abre a tela da votação; os
 * demais, o próprio Início (onde o resultado aparece no topo).
 */
async function resultadoVotacaoEquipe(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  const snap = await base(ctx).collection("elections").where("status", "==", "publicada").limit(20).get();
  const inicio = ctx.permissoes.has("area.gestao") ? "/admin" : ctx.permissoes.has("area.portaria") ? "/portaria" : "/";
  return snap.docs
    .map((d) => ({ e: paraEleicao(d.id, d.data()), final: resultadoFinalDe(d.data()) }))
    .filter(({ e, final }) => final && e.resultadoDivulgadoEm && dentroDaJanela(e.resultadoDivulgadoEm, agora, 7))
    .map(({ e, final }) => ({
      id: `votacao:${e.id}:resultado`,
      tipo: "votacao",
      titulo: `Resultado da votação: ${final!.titulo}`,
      texto: `${e.titulo}: ${final!.numeros}.`,
      href: ctx.permissoes.has("eleicoes.gerenciar") ? `/admin/votacao/${e.id}` : inicio,
      quando: ms(e.resultadoDivulgadoEm),
      acao: false,
      tom: final!.eleita === false ? "neutro" : "ok",
    }));
}

async function enquetesAbertas(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  const snap = await base(ctx).collection("polls").where("status", "==", "aberta").limit(LIMITE).get();
  const abertas = snap.docs.map((d) => ({ ref: d.ref, e: paraEnquete(d.id, d.data()) })).filter((x) => situacaoEnquete(x.e, agora) === "aberta");
  return Promise.all(
    abertas.map(async ({ ref, e }) => {
      const respondeu = ctx.unitId ? (await ref.collection("votes").doc(ctx.unitId).get()).exists : false;
      return {
        id: `enquete:${e.id}`,
        tipo: "enquete" as const,
        titulo: respondeu ? "Enquete aberta" : "Enquete aberta: dê sua opinião",
        texto: respondeu ? `${e.pergunta} (sua casa já respondeu)` : `${e.pergunta} Responda até ${formatarDataHora(e.fechaEm, ctx.fuso)}.`,
        href: `/enquetes/${e.id}`,
        quando: ms(e.abreEm),
        acao: !respondeu && !!ctx.unitId,
        tom: "destaque" as const,
      };
    }),
  );
}

/** `tela`: onde a pessoa lê o comunicado (morador: /comunicados; portaria: /portaria/comunicados). */
async function comunicadosRecentes(ctx: Contexto, agora: Date, tela = "/comunicados"): Promise<Notificacao[]> {
  const desde = Timestamp.fromMillis(agora.getTime() - 30 * 86_400_000);
  const snap = await base(ctx)
    .collection("announcements")
    .where("publicadoEm", ">=", desde)
    .select("titulo", "prioridade", "publicadoEm", "status")
    .limit(LIMITE)
    .get();
  return snap.docs
    .filter((d) => d.get("status") === "publicado")
    .map((d) => {
      const urgente = d.get("prioridade") === "urgente";
      return {
        id: `comunicado:${d.id}`,
        tipo: "comunicado",
        titulo: urgente ? "Comunicado urgente da administração" : "Comunicado da administração",
        texto: texto(d.get("titulo"), "Comunicado"),
        href: `${tela}/${d.id}`,
        quando: ms(data(d.get("publicadoEm"))),
        acao: false,
        tom: urgente ? "erro" : "info",
      };
    });
}

async function documentosRecentes(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  const docs = await documentosVisiveis(ctx);
  return docs
    .filter((d) => dentroDaJanela(d.atualizadoEm, agora))
    .map((d) => ({
      id: `documento:${d.id}:${ms(d.atualizadoEm)}`,
      tipo: "documento",
      titulo: "Documento disponível",
      texto: d.titulo,
      href: "/documentos",
      quando: ms(d.atualizadoEm),
      acao: false,
      tom: "info",
    }));
}

// ---------- Portaria ----------

/** Visitas autorizadas pelos moradores que ainda valem (hoje ou nos próximos dias). */
async function visitasAutorizadas(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  const hoje = hojeISO(agora, ctx.fuso);
  // Mesma consulta da lista "Esperados hoje" (índice status + validaAte).
  const snap = await base(ctx).collection("visitors").where("status", "==", "ativa").where("validaAte", ">=", hoje).limit(LIMITE).get();
  return snap.docs.map((d) => {
    const dia = texto(d.get("data"));
    const ate = texto(d.get("validaAte")) || dia;
    const quando = dia > hoje ? `para ${dataISOParaBR(dia)}` : ate > hoje ? `vale até ${dataISOParaBR(ate)}` : "para hoje";
    return {
      id: `visita:${d.id}`,
      tipo: "visita_autorizada" as const,
      titulo: `Visita autorizada · ${texto(d.get("unidadeRotulo")) || texto(d.get("unitId"), "casa")}`,
      texto: `${texto(d.get("nome"), "Visitante")} · ${quando}`,
      href: "/portaria",
      quando: ms(data(d.get("criadoEm"))),
      acao: false,
      tom: "info" as const,
    };
  });
}

// ---------- Morador: respostas ao que a casa pediu ----------

async function meusAnunciosDecididos(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  const snap = await base(ctx).collection("classifieds").where("autorUid", "==", ctx.uid).limit(LIMITE).get();
  const lista: Notificacao[] = [];
  for (const d of snap.docs) {
    const status = d.get("status");
    const decidido = data(d.get("decididoEm"));
    if (!ehStatusClassificado(status) || !dentroDaJanela(decidido, agora)) continue;
    const titulo = texto(d.get("titulo"), "Anúncio");
    const motivo = texto(d.get("motivo"));
    const comum = { id: `meu-anuncio:${d.id}:${status}`, tipo: "anuncio_decidido" as const, href: "/classificados?aba=meus", quando: ms(decidido), acao: false };
    if (status === "aprovado") {
      lista.push({ ...comum, titulo: "Seu anúncio foi aprovado", texto: `“${titulo}” já aparece para os vizinhos.`, tom: "ok" });
    } else if (status === "rejeitado") {
      lista.push({ ...comum, titulo: "Seu anúncio não foi aprovado", texto: `“${titulo}”${motivo ? ` · Motivo: ${motivo}` : ""}`, tom: "erro" });
    } else if (status === "removido" && motivo !== "Removido pelo autor.") {
      lista.push({ ...comum, titulo: "Seu anúncio foi removido", texto: `“${titulo}”${motivo ? ` · Motivo: ${motivo}` : ""}`, tom: "neutro" });
    }
  }
  return lista;
}

async function minhasReservasDecididas(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  if (!ctx.unitId) return [];
  const snap = await base(ctx).collection("reservations").where("unitId", "==", ctx.unitId).limit(LIMITE).get();
  const lista: Notificacao[] = [];
  for (const d of snap.docs) {
    const status = d.get("status");
    const decidido = data(d.get("decididoEm"));
    if (d.get("origem") !== "morador" || (status !== "confirmada" && status !== "recusada") || !dentroDaJanela(decidido, agora)) continue;
    const dia = texto(d.get("data"));
    const quando = `${texto(d.get("areaNome"), "Área")}${dia ? ` · ${dataISOParaBR(dia)} ${texto(d.get("inicio"))}–${texto(d.get("fim"))}` : ""}`;
    const motivo = texto(d.get("motivo"));
    lista.push({
      id: `minha-reserva:${d.id}:${status}`,
      tipo: "reserva_decidida",
      titulo: status === "confirmada" ? "Sua reserva foi confirmada" : "Sua reserva foi recusada",
      texto: status === "recusada" && motivo ? `${quando} · Motivo: ${motivo}` : quando,
      href: "/reservas",
      quando: ms(decidido),
      acao: false,
      tom: status === "confirmada" ? "ok" : "erro",
    });
  }
  return lista;
}

async function minhasSolicitacoesRespondidas(ctx: Contexto, agora: Date): Promise<Notificacao[]> {
  if (!ctx.unitId) return [];
  const snap = await base(ctx).collection("tickets").where("unitId", "==", ctx.unitId).limit(LIMITE).get();
  const lista: Notificacao[] = [];
  for (const d of snap.docs) {
    const respondido = data(d.get("respondidoEm"));
    const status = d.get("status");
    if (!dentroDaJanela(respondido, agora) || !ehStatusSolicitacao(status)) continue;
    lista.push({
      id: `minha-solicitacao:${d.id}:${ms(respondido)}`,
      tipo: "solicitacao_respondida",
      titulo: `A administração respondeu: ${texto(d.get("protocolo"), "solicitação")}`,
      texto: `Situação: ${ROTULO_STATUS_SOLICITACAO[status]}`,
      href: `/solicitacoes/${d.id}`,
      quando: ms(respondido),
      acao: false,
      tom: status === "resolvida" ? "ok" : status === "cancelada" ? "neutro" : "info",
    });
  }
  return lista;
}

// ---------- Montagem ----------

/** A lista do sino desta pessoa (já ordenada: primeiro o que pede ação). */
export async function notificacoesDaPessoa(ctx: Contexto, agora = new Date()): Promise<Notificacao[]> {
  const p = ctx.permissoes;
  // Avisos de morador só para quem É morador (o síndico tem todas as permissões, mas o
  // sino dele mostra só o que espera a administração).
  const morador = ctx.papel === "morador" && p.has("area.morador");
  const portaria = ctx.papel === "portaria" && p.has("area.portaria");
  const partes = await Promise.all([
    p.has("classificados.moderar") ? semFalhar("os anúncios aguardando", () => anunciosAguardando(ctx)) : [],
    p.has("reservas.gerenciar") && (ctx.papel === "admin" || ctx.papel === "reservas")
      ? semFalhar("as reservas pendentes", () => reservasPendentes(ctx))
      : [],
    p.has("solicitacoes.gerenciar") ? semFalhar("as solicitações abertas", () => solicitacoesAbertas(ctx)) : [],
    morador && p.has("eleicoes.votar") ? semFalhar("a votação oficial", () => votacaoOficial(ctx, agora)) : [],
    !morador ? semFalhar("o resultado da votação", () => resultadoVotacaoEquipe(ctx, agora)) : [],
    morador && p.has("enquetes.votar") ? semFalhar("as enquetes", () => enquetesAbertas(ctx, agora)) : [],
    morador && p.has("comunicados.ver") ? semFalhar("os comunicados", () => comunicadosRecentes(ctx, agora)) : [],
    morador && p.has("documentos.ver") ? semFalhar("os documentos", () => documentosRecentes(ctx, agora)) : [],
    morador && p.has("classificados.usar") ? semFalhar("os seus anúncios", () => meusAnunciosDecididos(ctx, agora)) : [],
    morador && p.has("reservas.fazer") ? semFalhar("as suas reservas", () => minhasReservasDecididas(ctx, agora)) : [],
    morador && p.has("solicitacoes.abrir") ? semFalhar("as suas solicitações", () => minhasSolicitacoesRespondidas(ctx, agora)) : [],
    portaria && p.has("visitantes.ver_todos") ? semFalhar("as visitas autorizadas", () => visitasAutorizadas(ctx, agora)) : [],
    portaria && p.has("comunicados.ver")
      ? semFalhar("os comunicados", () => comunicadosRecentes(ctx, agora, "/portaria/comunicados"))
      : [],
  ]);
  return montarLista(partes);
}

// ---------- "Já vi" ----------

/** Documento com a data em que a pessoa abriu o sino pela última vez (só o servidor lê e grava). */
const docVisto = (ctx: Contexto) => base(ctx).collection("sino").doc(ctx.uid);

export async function lerVistasEm(ctx: Contexto): Promise<number | null> {
  const d = await docVisto(ctx).get();
  return data((d.data() as DocumentData | undefined)?.vistasEm)?.getTime() ?? null;
}

/**
 * Marca "vi as notificações agora". Não vai para a auditoria: é como marcar um
 * e-mail como lido, não muda nada para as outras pessoas.
 */
export async function gravarVistasAgora(ctx: Contexto): Promise<void> {
  await docVisto(ctx).set({ vistasEm: FieldValue.serverTimestamp() });
}
