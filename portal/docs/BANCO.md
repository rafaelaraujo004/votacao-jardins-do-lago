# Banco de dados (Firestore)

Todos os dados de um condomínio ficam **dentro** de `condominiums/{condominioId}`. O isolamento aparece no próprio caminho do documento, nas regras e no código do servidor.

```
users/{uid}                          nome, condominioIds[], condominioAtivo     (só a própria pessoa lê)
rateLimits/{hash}                    limite de tentativas (só servidor; expira via TTL em expiraEm)

condominiums/{c}                     nome, status, fuso, moeda, (portalPublico: campo antigo, sem efeito — pode ficar esquecido),
                                     informacoes {telefonePortaria, telefoneAdministracao, whatsappAdministracao,
                                     horarioAdministracao, aviso, atualizadoEm}
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
  amenities/{id}                     nome, regras, capacidade, exigeAprovacao, antecedenciaMinDias, antecedenciaMaxDias,
                                     limitePorMes, ativa, ordem, faixas[{id,rotulo,inicio,fim}]
  reservations/{id}                  amenityId, areaNome, unitId (null = bloqueio), unidadeRotulo, data, mes, faixaId,
                                     faixaRotulo, inicio, fim, status (pendente/confirmada/bloqueada/recusada/cancelada),
                                     observacao, motivo, origem, criadoPor, decididoPor — nunca apagado
  reservationLocks/{area_data_faixa} trava: criada em transação; APAGADA ao recusar/cancelar (o histórico fica na reserva)
  visitors/{id}                      unitId, unidadeRotulo, nome, tipo, data, validaAte (AAAA-MM-DD), usoUnico, usos,
                                     observacao, codigoHash (HMAC), status (ativa/usada/cancelada), anonimizado
  accessEvents/{id}                  tipo (entrada/saida), origem (codigo/sem_codigo), visitorId, unitId, nome, data, quando,
                                     dentro/saidaEm/saidaId (só na entrada), entradaId (só na saída), anonimizado — nunca apagado
  packages/{id}                      unitId, destinatario, tipo, observacao, status (aguardando/entregue), dataRecebimento,
                                     recebidoEm/Por, entregueEm/Por, retiradoPor
  announcements/{id}                 titulo, texto, prioridade, publicado
  tickets/{id}                       protocolo, unitId, categoria, descricao, status, responsavel
    updates/{id}                     histórico da solicitação
  documents/{id}                     titulo, tipo, visivelPara[] (papéis)
  polls/{id}                         pergunta, opções, prazo, status
    votes/{unitId}                   um voto por casa
  classifieds/{id}                   autorUid, texto, status (moderação)
  mapPoints/{id}  usefulInfo/{id}
  counters/{nome}                    numeração de protocolos (só servidor)
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

## Índices

Em `firestore.indexes.json`. Inclui a política de expiração (TTL) de `rateLimits.expiraEm`.

| Índice | Usado por |
|---|---|
| `auditLogs`: acao + criadoEm (desc.) | tela de auditoria |
| `visitors`: unitId + criadoEm (desc.) | "Minhas autorizações" do morador |
| `visitors`: status + validaAte | "Esperados hoje" da portaria |
| `visitors`: anonimizado + validaAte | limpeza LGPD |
| `accessEvents`: anonimizado + data | limpeza LGPD |
| `packages`: unitId + status + entregueEm (desc.) | encomendas já retiradas, na tela do morador |

As consultas de reservas usam só igualdades ou uma faixa num campo só (`data`), e a ordenação é feita em memória: não precisam de índice composto.
