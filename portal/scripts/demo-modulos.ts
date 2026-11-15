/**
 * Dados FICTÍCIOS dos módulos novos para o condomínio de DEMONSTRAÇÃO.
 * Usado por semear-demo.ts (simulador) e criar-demo-real.ts (demo no Firebase real).
 * Nenhum nome, telefone ou link aqui é real.
 *
 * - Áreas: as mesmas regras do condomínio real (src/lib/areas-jardins.ts),
 *   com reservas de exemplo que respeitam essas regras.
 * - Comunicados, solicitações (com protocolo e linha do tempo), documentos-link,
 *   enquetes (1 aberta e 1 encerrada) e classificados (2 aprovados, 1 pendente).
 */
import { FieldValue, Timestamp, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { AREAS_JARDINS_DO_LAGO } from "../src/lib/areas-jardins";
import { idDaTrava, proximoMes, somarDias } from "../src/lib/reservas";

export type PessoasDemo = {
  /** Hoje no fuso do condomínio ("AAAA-MM-DD"). */
  hoje: string;
  adminUid: string;
  adminNome: string;
  /** Morador demo (Casa 12). */
  moradorUid: string;
  moradorNome: string;
};

const DIA = 86_400_000;
const atras = (dias: number, horas = 0) => Timestamp.fromMillis(Date.now() - dias * DIA - horas * 3_600_000);
const adiante = (dias: number) => Timestamp.fromMillis(Date.now() + dias * DIA);

/** Áreas reais (com demo: true) e reservas fictícias coerentes com as regras. */
export function semearAreasDemo(db: Firestore, lote: WriteBatch, c: string, p: PessoasDemo): void {
  const agora = FieldValue.serverTimestamp();
  for (const { id, ...area } of AREAS_JARDINS_DO_LAGO) {
    lote.set(db.doc(`${c}/amenities/${id}`), { ...area, demo: true, criadoEm: agora });
  }

  const mesQueVem = proximoMes(p.hoje.slice(0, 7));
  type R = {
    id: string;
    area: string;
    data: string;
    faixa: number;
    unitId: string | null;
    rotulo: string | null;
    status: "pendente" | "confirmada" | "bloqueada" | "cancelada";
    origem: "morador" | "administracao";
    motivo?: string;
    observacao?: string;
    tardio?: boolean;
  };
  const reservas: R[] = [
    // Área de lazer: 48 h de antecedência, aprovação, 1 por casa por dia.
    { id: "demo-res-1", area: "area-de-lazer", data: somarDias(p.hoje, 6), faixa: 0, unitId: "casa-012", rotulo: "Casa 12", status: "confirmada", origem: "morador", observacao: "Aniversário" },
    { id: "demo-res-2", area: "area-de-lazer", data: somarDias(p.hoje, 10), faixa: 0, unitId: "casa-001", rotulo: "Casa 1", status: "pendente", origem: "morador", observacao: "Almoço de família" },
    { id: "demo-res-3", area: "area-de-lazer", data: `${mesQueVem}-12`, faixa: 0, unitId: "casa-120", rotulo: "Casa 120", status: "confirmada", origem: "morador" },
    // Desistência fora do prazo (aparece no filtro do síndico; não ocupa o horário).
    { id: "demo-res-4", area: "area-de-lazer", data: somarDias(p.hoje, 1), faixa: 0, unitId: "casa-045", rotulo: "Casa 45", status: "cancelada", origem: "morador", tardio: true },
    // Quadra: 1 h por dia; a Casa 2 passou do limite porque nenhuma outra casa reservou no dia.
    { id: "demo-res-5", area: "quadra", data: somarDias(p.hoje, 1), faixa: 0, unitId: "casa-002", rotulo: "Casa 2", status: "confirmada", origem: "morador" },
    { id: "demo-res-6", area: "quadra", data: somarDias(p.hoje, 1), faixa: 1, unitId: "casa-002", rotulo: "Casa 2", status: "confirmada", origem: "morador" },
    { id: "demo-res-7", area: "quadra", data: somarDias(p.hoje, 2), faixa: 2, unitId: null, rotulo: null, status: "bloqueada", origem: "administracao", motivo: "Manutenção da iluminação" },
    // Equipamentos: 24 h de antecedência e aprovação.
    { id: "demo-res-8", area: "rocadeira", data: somarDias(p.hoje, 3), faixa: 0, unitId: "casa-045", rotulo: "Casa 45", status: "confirmada", origem: "morador" },
    { id: "demo-res-9", area: "carrinho-de-mao", data: somarDias(p.hoje, 4), faixa: 0, unitId: "casa-012", rotulo: "Casa 12", status: "pendente", origem: "morador" },
  ];

  for (const r of reservas) {
    const area = AREAS_JARDINS_DO_LAGO.find((a) => a.id === r.area)!;
    const faixa = area.faixas[r.faixa];
    const doMorador = r.origem === "morador";
    const decidida = r.status !== "pendente";
    lote.set(db.doc(`${c}/reservations/${r.id}`), {
      amenityId: area.id,
      areaNome: area.nome,
      unitId: r.unitId,
      unidadeRotulo: r.rotulo,
      data: r.data,
      mes: r.data.slice(0, 7),
      faixaId: faixa.id,
      faixaRotulo: faixa.rotulo,
      inicio: faixa.inicio,
      fim: faixa.fim,
      status: r.status,
      observacao: r.observacao ?? "",
      motivo: r.motivo ?? (r.tardio ? "Desistência do morador." : ""),
      origem: r.origem,
      prazoDesistenciaHoras: area.prazoDesistenciaHoras,
      aceitouRegrasEm: doMorador && area.exigencias.length ? agora : null,
      cancelamentoTardio: r.tardio === true,
      canceladoEm: r.status === "cancelada" ? atras(0, 2) : null,
      criadoPor: doMorador ? p.moradorUid : p.adminUid,
      criadoPorNome: doMorador ? "Morador (demonstração)" : p.adminNome,
      criadoEm: agora,
      decididoPor: decidida ? p.adminUid : null,
      decididoPorNome: decidida ? p.adminNome : "",
      decididoEm: decidida ? agora : null,
      demo: true,
    });
    // Só horários ocupados têm trava (cancelada libera o horário).
    if (r.status !== "cancelada") {
      lote.set(db.doc(`${c}/reservationLocks/${idDaTrava(area.id, r.data, faixa.id)}`), {
        reservaId: r.id,
        amenityId: area.id,
        data: r.data,
        faixaId: faixa.id,
        criadoEm: agora,
      });
    }
  }
}

/** Comunicados, solicitações, documentos, enquetes e classificados fictícios. */
export function semearModulosDemo(db: Firestore, lote: WriteBatch, c: string, p: PessoasDemo): void {
  const ano = p.hoje.slice(0, 4);

  // ---------- Comunicados (2 publicados, sendo 1 urgente; 1 rascunho) ----------
  const comunicados = [
    {
      id: "demo-comunicado-1",
      titulo: "Coleta de lixo",
      texto: "A coleta passa às terças e sextas pela manhã.\n\nDeixe os sacos bem fechados nas lixeiras da frente.",
      prioridade: "normal",
      fixado: true,
      status: "publicado",
      publicadoEm: atras(3),
    },
    {
      id: "demo-comunicado-2",
      titulo: "Falta de água na quinta-feira",
      texto: "A companhia vai fazer manutenção na rede.\n\nA água pode faltar das 8h às 14h. Guarde água para o período.",
      prioridade: "urgente",
      fixado: false,
      status: "publicado",
      publicadoEm: atras(0, 3),
    },
    {
      id: "demo-comunicado-3",
      titulo: "Pintura da portaria (rascunho)",
      texto: "Texto ainda em preparação.",
      prioridade: "normal",
      fixado: false,
      status: "rascunho",
      publicadoEm: null,
    },
  ];
  for (const { id, ...m } of comunicados) {
    lote.set(db.doc(`${c}/announcements/${id}`), {
      ...m,
      criadoPor: p.adminUid,
      criadoPorNome: "Administração",
      criadoEm: atras(4),
      atualizadoEm: m.publicadoEm ?? atras(1),
      demo: true,
    });
  }

  // ---------- Solicitações (protocolo AAAA-NNNN) ----------
  const tickets = [
    {
      id: "demo-sol-1",
      numero: 1,
      unitId: "casa-045",
      rotulo: "Casa 45",
      categoria: "iluminacao",
      local: "Poste em frente à Casa 45",
      descricao: "A lâmpada do poste está apagada há três noites.",
      status: "resolvida",
      criadoEm: atras(9),
      resolvidoEm: atras(6),
      atualizacoes: [
        { tipo: "status", texto: "Eletricista chamado.", de: "aberta", para: "em_andamento", publico: true, dias: 8, morador: false },
        { tipo: "status", texto: "Lâmpada trocada.", de: "em_andamento", para: "resolvida", publico: true, dias: 6, morador: false },
      ],
    },
    {
      id: "demo-sol-2",
      numero: 2,
      unitId: "casa-012",
      rotulo: "Casa 12",
      categoria: "manutencao",
      local: "Calçada da rua principal",
      descricao: "Há um buraco na calçada perto da Casa 12. Alguém pode tropeçar.",
      status: "em_andamento",
      criadoEm: atras(4),
      resolvidoEm: null,
      atualizacoes: [
        { tipo: "status", texto: "Recebemos e vamos orçar o conserto.", de: "aberta", para: "em_andamento", publico: true, dias: 3, morador: false },
        { tipo: "comentario", texto: "Pedir orçamento a dois pedreiros.", de: null, para: null, publico: false, dias: 3, morador: false },
        { tipo: "comentario", texto: "Obrigada! Coloquei um cone no local.", de: null, para: null, publico: true, dias: 2, morador: true },
      ],
    },
    {
      id: "demo-sol-3",
      numero: 3,
      unitId: "casa-012",
      rotulo: "Casa 12",
      categoria: "limpeza",
      local: "Área de lazer",
      descricao: "As lixeiras externas da área de lazer estão cheias desde o fim de semana.",
      status: "aberta",
      criadoEm: atras(0, 5),
      resolvidoEm: null,
      atualizacoes: [],
    },
  ];
  for (const t of tickets) {
    const ref = db.doc(`${c}/tickets/${t.id}`);
    lote.set(ref, {
      protocolo: `${ano}-${String(t.numero).padStart(4, "0")}`,
      unitId: t.unitId,
      unidadeRotulo: t.rotulo,
      categoria: t.categoria,
      local: t.local,
      descricao: t.descricao,
      status: t.status,
      criadoPor: t.unitId === "casa-012" ? p.moradorUid : `demo-morador-${t.unitId}`,
      criadoEm: t.criadoEm,
      atualizadoEm: t.atualizacoes.length ? atras(t.atualizacoes.at(-1)!.dias) : t.criadoEm,
      resolvidoEm: t.resolvidoEm,
      demo: true,
    });
    t.atualizacoes.forEach((u, i) => {
      lote.set(ref.collection("updates").doc(`demo-upd-${i + 1}`), {
        tipo: u.tipo,
        texto: u.texto,
        deStatus: u.de,
        paraStatus: u.para,
        autorUid: u.morador ? p.moradorUid : p.adminUid,
        autorNome: u.morador ? p.moradorNome : p.adminNome,
        autorPapel: u.morador ? "morador" : "administracao",
        publico: u.publico,
        criadoEm: atras(u.dias, -i), // a ordem do dia segue a lista
      });
    });
  }
  lote.set(db.doc(`${c}/counters/solicitacoes-${ano}`), { ultimo: tickets.length, ano: Number(ano), atualizadoEm: FieldValue.serverTimestamp() });

  // ---------- Documentos (links de exemplo) ----------
  const documentos = [
    { id: "demo-doc-1", titulo: "Regimento interno", categoria: "regimento", descricao: "Regras de convivência do condomínio." },
    { id: "demo-doc-2", titulo: "Convenção do condomínio", categoria: "convencao", descricao: "" },
    { id: "demo-doc-3", titulo: "Ata da última assembleia", categoria: "ata", descricao: "Assembleia geral ordinária." },
  ];
  for (const { id, ...d } of documentos) {
    lote.set(db.doc(`${c}/documents/${id}`), {
      ...d,
      url: `https://example.com/demo/${id}`,
      visivelPara: ["admin", "morador", "portaria", "conselheiro"],
      ativo: true,
      criadoPor: p.adminUid,
      criadoEm: atras(20),
      atualizadoEm: atras(5),
      atualizadoPor: p.adminUid,
      demo: true,
    });
  }

  // ---------- Enquetes (1 aberta, 1 encerrada) ----------
  // Aberta: a Casa 12 (morador demo) ainda não votou, para testar o voto.
  const votosAberta: [string, string][] = [
    ["casa-045", "o1"],
    ["casa-001", "o2"],
  ];
  lote.set(db.doc(`${c}/polls/demo-enquete-aberta`), {
    pergunta: "Qual o melhor dia para o mutirão de limpeza?",
    descricao: "Um voto por casa. O resultado aparece desde já.",
    opcoes: [
      { id: "o1", texto: "Sábado de manhã" },
      { id: "o2", texto: "Domingo de manhã" },
    ],
    abreEm: atras(1),
    fechaEm: adiante(6),
    status: "aberta",
    resultado: "sempre",
    totais: { o1: 1, o2: 1 },
    totalVotos: votosAberta.length,
    criadoPor: p.adminUid,
    criadoPorNome: p.adminNome,
    criadoEm: atras(2),
    publicadoEm: atras(1),
    demo: true,
  });
  for (const [unidade, opcaoId] of votosAberta) {
    lote.set(db.doc(`${c}/polls/demo-enquete-aberta/votes/${unidade}`), { opcaoId, uid: `demo-morador-${unidade}`, votadoEm: atras(0, 6) });
  }
  const votosEncerrada: [string, string][] = [
    ["casa-012", "o1"],
    ["casa-045", "o1"],
    ["casa-001", "o2"],
    ["casa-120", "o1"],
  ];
  lote.set(db.doc(`${c}/polls/demo-enquete-encerrada`), {
    pergunta: "Instalar redes de proteção na quadra?",
    descricao: "Resultado mostrado só depois de encerrar.",
    opcoes: [
      { id: "o1", texto: "Sim" },
      { id: "o2", texto: "Não" },
    ],
    abreEm: atras(20),
    fechaEm: atras(10),
    status: "encerrada",
    resultado: "apos_encerrar",
    totais: { o1: 3, o2: 1 },
    totalVotos: votosEncerrada.length,
    criadoPor: p.adminUid,
    criadoPorNome: p.adminNome,
    criadoEm: atras(21),
    publicadoEm: atras(20),
    encerradaEm: atras(10),
    encerradaPor: null,
    demo: true,
  });
  for (const [unidade, opcaoId] of votosEncerrada) {
    const uid = unidade === "casa-012" ? p.moradorUid : `demo-morador-${unidade}`;
    lote.set(db.doc(`${c}/polls/demo-enquete-encerrada/votes/${unidade}`), { opcaoId, uid, votadoEm: atras(15) });
  }

  // ---------- Classificados (2 aprovados, 1 pendente) ----------
  const primeiroNome = p.moradorNome.split(" ")[0] || "Morador";
  const anuncios = [
    {
      id: "demo-classificado-1",
      titulo: "Bicicleta aro 26",
      texto: "Bicicleta em bom estado, pneus novos. Retirar na casa.",
      categoria: "venda",
      preco: 35000,
      contatoWhatsapp: "5594900000006",
      autorUid: "demo-autor-casa-120",
      autorPrimeiroNome: "Pedro",
      unitId: "casa-120",
      status: "aprovado",
      decididoEm: atras(2),
      expiraEm: Timestamp.fromMillis(atras(2).toMillis() + 30 * DIA),
    },
    {
      id: "demo-classificado-2",
      titulo: "Bolos caseiros por encomenda",
      texto: "Faço bolos de aniversário e doces. Peça com dois dias de antecedência.",
      categoria: "servico",
      preco: null,
      contatoWhatsapp: null,
      autorUid: p.moradorUid,
      autorPrimeiroNome: primeiroNome,
      unitId: "casa-012",
      status: "aprovado",
      decididoEm: atras(5),
      expiraEm: Timestamp.fromMillis(atras(5).toMillis() + 30 * DIA),
    },
    {
      id: "demo-classificado-3",
      titulo: "Doação de roupas de criança",
      texto: "Roupas de 2 a 4 anos, em bom estado.",
      categoria: "doacao",
      preco: null,
      contatoWhatsapp: null,
      autorUid: p.moradorUid,
      autorPrimeiroNome: primeiroNome,
      unitId: "casa-012",
      status: "pendente",
      decididoEm: null,
      expiraEm: null,
    },
  ];
  for (const { id, ...a } of anuncios) {
    lote.set(db.doc(`${c}/classifieds/${id}`), { ...a, motivo: "", criadoEm: atras(6), demo: true });
  }
}
