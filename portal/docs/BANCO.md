# Banco de dados (Firestore)

Todos os dados de um condomínio ficam **dentro** de `condominiums/{condominioId}`. O isolamento aparece no próprio caminho do documento, nas regras e no código do servidor.

```
users/{uid}                          nome, condominioIds[], condominioAtivo     (só a própria pessoa lê)
rateLimits/{hash}                    limite de tentativas (só servidor; expiraEm diz até quando vale — sem TTL, plano Spark)

condominiums/{c}                     nome, status, fuso, moeda, (portalPublico: campo antigo, sem efeito — pode ficar esquecido),
                                     informacoes {telefonePortaria, telefoneAdministracao, whatsappAdministracao,
                                     horarioAdministracao, aviso, atualizadoEm,
                                     pix {chave (só dígitos no CNPJ/CPF/celular), tipo (cnpj/cpf/email/telefone/aleatoria),
                                     favorecido} | null, telefoneRonda, responsavelReservas {nome, telefone, horario|null} | null,
                                     linkVotacao (https) | null}  — cada formulário grava só os seus campos ("informacoes.<campo>")
  members/{uid}                      nome, papel, unitId, status, permissoesExtras[], permissoesNegadas[],
                                     precisaTrocarSenha?, senhaProvisoriaValidaDesde? (ms, marca do Firebase),
                                     senhaProvisoriaEm?, senhaProvisoriaPor?, senhaTrocadaEm?,
                                     usuario? (só morador: código de 6 caracteres, ex. "K7M4PX"), usuarioCriadoEm?
                                     (nenhuma senha nem e-mail fica no Firestore: o e-mail fica só no Authentication)
  usernames/{codigo}                 uid, criadoEm, criadoPor — índice "um usuário, uma pessoa" (criado em transação;
                                     só o servidor lê e grava)
  units/{unitId}                     rotulo, numero, quadra, titularUid, status
  financialCategories/{id}           nome, tipo (receita/despesa)
  financialEntries/{id}              tipo, categoriaId, valorCentavos, data (AAAA-MM-DD), forma, descricao,
                                     publicado, estornaId, estornadoPor   — nunca editado nem apagado
  monthlySummaries/{AAAA-MM}         saldoAnterior, receitas, despesas, saldo, publicado
  amenities/{id}                     tipo (area/equipamento), nome, regras, capacidade (0 = não informada), exigeAprovacao,
                                     antecedenciaMinimaHoras (o antigo antecedenciaMinDias ainda é lido ×24),
                                     antecedenciaMaxDias, prazoDesistenciaHoras, limitePorMes (0 = sem limite),
                                     limitePorCasaPorDia (null = sem limite), permitirExtraSeDiaLivre, exigencias[] ("Li e concordo"),
                                     avisos[], faixasLivres[{rotulo,inicio,fim}] (uso livre, só informativo), ativa, ordem,
                                     faixas[{id,rotulo,inicio,fim}]
                                     Condomínio real: area-de-lazer, quadra, rocadeira, carrinho-de-mao (src/lib/areas-jardins.ts)
  reservations/{id}                  amenityId, areaNome, unitId (null = bloqueio), unidadeRotulo, data, mes, faixaId,
                                     faixaRotulo, inicio, fim, status (pendente/confirmada/bloqueada/recusada/cancelada),
                                     observacao, motivo, origem, criadoPor, decididoPor, prazoDesistenciaHoras (cópia do prazo
                                     no momento da reserva), aceitouRegrasEm|null, cancelamentoTardio, canceladoEm|null — nunca apagado
  reservationLocks/{area_data_faixa} trava: criada em transação; APAGADA ao recusar/cancelar (o histórico fica na reserva)
  visitors/{id}                      unitId, unidadeRotulo, nome, tipo, data, validaAte (AAAA-MM-DD), usoUnico, usos,
                                     observacao, codigoHash (HMAC), status (ativa/usada/cancelada), anonimizado
  accessEvents/{id}                  tipo (entrada/saida), origem (codigo/sem_codigo), visitorId, unitId, nome, data, quando,
                                     dentro/saidaEm/saidaId (só na entrada), entradaId (só na saída), anonimizado — nunca apagado
  packages/{id}                      unitId, destinatario, tipo, observacao, status (aguardando/entregue), dataRecebimento,
                                     recebidoEm/Por, entregueEm/Por, retiradoPor
  announcements/{id}                 titulo, texto, prioridade (normal/urgente), fixado, status (rascunho/publicado/arquivado),
                                     publicadoEm|null (1ª publicação), criadoPor, criadoPorNome, criadoEm, atualizadoEm
                                     — nunca apagado ("despublicar" = arquivar)
  tickets/{id}                       protocolo ("AAAA-NNNN"), unitId, unidadeRotulo, categoria, local, descricao,
                                     status (aberta/em_andamento/resolvida/cancelada), criadoPor, criadoEm, atualizadoEm,
                                     resolvidoEm|null
    updates/{id}                     tipo (comentario/status), texto, deStatus, paraStatus, autorUid, autorNome,
                                     autorPapel, publico (false = nota interna: a casa não vê), criadoEm
  documents/{id}                     titulo, descricao, categoria (regimento/convencao/ata/prestacao/outro), url (só https —
                                     LINK; nenhum arquivo é guardado), visivelPara[] (papéis; sempre inclui admin), ativo,
                                     criadoPor, criadoEm, atualizadoEm, atualizadoPor — nunca apagado (desativar)
  polls/{id}                         pergunta, descricao, opcoes[{id,texto}], abreEm, fechaEm, status (rascunho/aberta/encerrada),
                                     resultado (sempre/apos_encerrar), totais{opcaoId: n}, totalVotos, criadoPor, criadoPorNome,
                                     criadoEm, atualizadoEm, publicadoEm, encerradaEm, encerradaPor
    votes/{unitId}                   opcaoId, uid, votadoEm — 1 voto por CASA, criado em transação; sem troca
  classifieds/{id}                   titulo, texto, categoria (venda/servico/doacao/procura/outro), preco (centavos)|null,
                                     contatoWhatsapp (só dígitos, com 55)|null, autorUid, autorPrimeiroNome, unitId,
                                     status (pendente/aprovado/rejeitado/removido/expirado), motivo, criadoEm, decididoEm,
                                     expiraEm (30 dias após aprovar; vencido = "expirado" na leitura) — nunca apagado
  mapPoints/{id}  usefulInfo/{id}
  counters/solicitacoes-AAAA         {ultimo, ano, atualizadoEm} — numeração dos protocolos (só servidor, em transação)
  auditLogs/{id}                     uid, nome, papel, acao, alvo, detalhes, criadoEm — só acréscimo
```

Coleções em inglês (padrão do Firebase e da sugestão inicial); campos em português (linguagem do projeto).

## Decisões

| Decisão | Por quê |
|---|---|
| `members` dentro do condomínio, em vez de `memberships` na raiz | O caminho já diz o condomínio; as regras ficam simples (`condominiums/$(c)/members/$(uid)`). |
| `users/{uid}.condominioIds` | Só um índice para saber onde a pessoa tem vínculo. **Não dá acesso a nada**: o servidor sempre confere o `members` correspondente. |
| Papel no banco, não em "custom claims" do token | Suspender alguém vale na hora; claims só atualizam quando o token renova (até 1 hora). Custo: uma leitura a mais por pedido. |
| `reservationLocks` com ID fixo | Duas pessoas reservando o mesmo horário ao mesmo tempo: a transação de uma delas falha, sem depender de "olhar e depois gravar". |
| `monthlySummaries` | A tela financeira lê 1 documento por mês, em vez de somar todos os lançamentos. |
| Lançamentos nunca apagados | Correção é feita por **estorno** (lançamento inverso ligado ao original), com auditoria. |
| `codigoHash` dos visitantes | Como na votação: no banco fica só o HMAC do código; uma cópia do banco não revela códigos válidos. |
| `rateLimits` com hash do IP | Limita tentativas sem guardar o IP em texto. |
| Usuário do morador vira e-mail sintético | O Firebase Auth só entende e-mail + senha. `K7M4PX` no condomínio `c` vira `k7m4px@morador.c.portal.invalid` (sempre o mesmo, então o login não consulta o banco antes). `.invalid` nunca existe na internet. |
| `usernames/{codigo}` | Garante que o mesmo código não é dado a duas pessoas do condomínio (o Firebase também recusa dois e-mails iguais). |
| `informacoes` no documento do condomínio | A área do morador (com login) lê um documento só e devolve uma lista fechada de campos (nunca o documento inteiro). O antigo `portalPublico` não é mais lido nem gravado: não existe área sem login. |
| `votes/{unitId}` com o id da casa | O "1 voto por casa" vem do próprio caminho: a transação usa `create`, que falha se a casa já votou. O síndico só vê `totais`. |
| `counters/solicitacoes-AAAA` | Protocolo sequencial por ano sem repetir, lido e gravado na mesma transação que cria a solicitação. |
| `classifieds` só pelo servidor | O documento tem `autorUid` e `unitId`; os outros moradores recebem só primeiro nome e o contato escolhido pelo autor. |
| Áreas reais por id fixo | O script `configurar-jardins-do-lago` pode rodar de novo sem duplicar nada (merge por id). |

## Índices

Em `firestore.indexes.json`. **Sem política de expiração (TTL)**: o projeto está no plano gratuito Spark.

| Índice | Usado por |
|---|---|
| `auditLogs`: acao + criadoEm (desc.) | tela de auditoria |
| `visitors`: unitId + criadoEm (desc.) | "Minhas autorizações" do morador |
| `visitors`: status + validaAte | "Esperados hoje" da portaria |
| `visitors`: anonimizado + validaAte | limpeza LGPD |
| `accessEvents`: anonimizado + data | limpeza LGPD |
| `packages`: unitId + status + entregueEm (desc.) | encomendas já retiradas, na tela do morador |

As consultas de reservas, comunicados, solicitações, documentos, enquetes, classificados e relatórios usam só igualdades, `in`/`array-contains` ou uma faixa num campo só (ex.: `data`, `mes`, `criadoEm`, `resolvidoEm`), e a ordenação é feita em memória: não precisam de índice composto. Atenção: não desligue (fieldOverrides) o índice automático desses campos.
