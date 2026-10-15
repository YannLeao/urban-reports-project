# Moderação e histórico de ocorrências

## Estado da integração

A base de estados, histórico privado, intenção durável de notificação e
visibilidade pública está implementada. Comando, fila e telas administrativas
dependem da fundação compartilhada de identidade: o modelo atual só tem USER,
sem atividade de conta, ADMIN/SUPER_ADMIN ou provisionamento legítimo.
Cadastro público continua exclusivamente USER. Não há promoção temporária.
A central de notificações também não está implementada. Esta base não conclui
RF-15–RF-20 nem o aceite completo da issue #24.

## Estados e justificativa

PENDING (Pendente), IN_ANALYSIS (Em análise), RESOLVED (Resolvida) e REJECTED
(Rejeitada). Somente PENDING → IN_ANALYSIS, PENDING → REJECTED,
IN_ANALYSIS → RESOLVED e IN_ANALYSIS → REJECTED são válidas. Estados finais
não têm saída. `OccurrenceTransition` e `transitionSchema` centralizam regras
para integrar ao futuro comando/formulário; ainda não persistem transições.

Rejeição exige 10–500 pontos de código Unicode após trim externo somente de
U+0009–U+000D e U+0020, igual ao contrato textual existente. NUL e UTF-16
inválido são recusados. Sem truncamento ou normalização NFC. Espaços não ASCII
são conteúdo. PostgreSQL exige o mesmo trim e conta com char_length.
Outros destinos aceitam ausência/null e recusam qualquer string de justificativa,
inclusive vazia. Renderizar texto sem interpretar HTML.

## Persistência e leitura

V7 é a próxima versão livre nesta checkout. Conferir migrations concorrentes
antes de integrar identidade; renumerar somente se ainda não aplicada em ambiente
compartilhado. V1–V6 permanecem intactas e Hibernate em validate. V7 amplia o
CHECK de estados, preserva os dados e não fabrica histórico retroativo.

`occurrence_history` guarda UUID do evento/ocorrência/responsável, origem,
destino, instante UTC/timestamptz, justificativa e versão resultante. O par
ocorrência/versão é único. FKs sem cascata preservam relato e responsável.
Trigger rejeita UPDATE, DELETE e TRUNCATE, inclusive fora do Hibernate;
entidade `@Immutable` e repositório somente de leitura reforçam a proteção.
Um operador privilegiado que possa remover/desabilitar triggers ou alterar
schema pode contorná-la; não é garantia contra administração do banco.

GET `/api/occurrences/{id}` inclui `history`, ordenado por occurred_at e versão
como desempate estável. Verifica autoria antes de consultar eventos; alheio ou
inexistente retorna 404. Itens: id, previousStatus, newStatus, occurredAt, reason
e responsible: "Moderação". UUID/e-mail do moderador não integram esse DTO;
a identidade exata permanece persistida. Lista privada e DTO público não
incluem histórico. `/meus-relatos/{id}` exibe cronologia e justificativa;
edição/exclusão continuam disponíveis somente em PENDING.

## Visibilidade pública

REJECTED fica fora da lista pública e retorna 404 no detalhe e na foto públicos.
A elegibilidade é verificada antes de chamar ImageStorage. Autor mantém acesso
privado. PENDING, IN_ANALYSIS e RESOLVED seguem públicos. O futuro mapa deve
reutilizar esse filtro. O DTO público nunca inclui histórico interno.

## Contrato pendente de escrita administrativa

A identidade compartilhada deve fornecer papel exato ADMIN, atividade atual,
provisionamento legítimo, login/sessão/revogação e desativação com lock da mesma
linha de `user_accounts`. SUPER_ADMIN não herda moderação. Revalidar autorização
no serviço mesmo fora do controller. Não criar entidade paralela de identidade.

Rotas previstas sob `/api/admin/occurrences`: GET da fila (somente
PENDING/IN_ANALYSIS, createdAt ASC/id ASC, page inicial 0, size padrão 20/máximo
50), GET `/{id}` (inclui finalizados, versão e histórico com nome legível do
responsável), GET `/{id}/image` e POST `/{id}/transitions` com JSON `{target,
reason}` e If-Match. São contratos ainda sem endpoints registrados. A cadeia
atual os recusa por negação padrão.

No futuro serviço transacional, bloquear conta antes de ocorrência. Confirmar
ADMIN ativo sob lock de conta é o ponto de autorização: desativação anterior
impede ação; desativação aguardando a transação não cancela ação já autorizada.
Revalidar versão e estado sob o mesmo lock de ocorrência usado por edição e
exclusão. Moderação não bloqueia journal nem faz I/O de storage; preserva a
ordem journal → ocorrência dos escritores com foto (ADR 0014). Não introduzir
caminho ocorrência → journal → conta. Implementação e testes dessas disputas
continuam pendentes da fundação.

Após autorização: validar comando, exigir If-Match (428 ausente, 412 divergente),
conferir máquina (409 incompatível), mudar estado, incrementar versão e inserir
evento na mesma transação. Validação: 400 no envelope ApiErrorResponse.
Responsável vem da identidade e horário do Clock. Responder após commit.
Não publicar escritor que confirme estado sem evento.

## Notificações

Trigger AFTER INSERT de histórico grava na mesma transação
`occurrence_notification_outbox(event_id, recipient_id, created_at)`.
event_id é PK/FK do evento; recipient_id vem do autor da ocorrência; created_at
replica o instante do evento. Rollback remove evento e intenção. Evento/versão
duplicado não cria outra intenção.

Esta é uma intenção de entrega, não a notificação visível. A central deve ler
o evento por JOIN com histórico, inserir notificação com UNIQUE(event_id) e
confirmar progresso na mesma transação, ou usar inbox deduplicada no consumidor
externo. Não apagar histórico para reconhecer consumo. Estratégia de consumo,
worker e prova de exatamente uma notificação ainda dependem dessa entrega.
Não há callback em memória nem stub declarado como integração concluída.

## Compatibilidade e demonstração

Publicar primeiro frontend que reconheça os quatro estados. Autenticação desta
base continua aceitando só USER; suporte aos novos papéis precisa preceder sua
emissão. Depois integrar identidade, coordenar migrations, publicar backend e
habilitar fluxo administrativo. Bundle antigo que aceita só PENDING/USER não
pode receber novos valores. Esta ordem não autoriza deploy implicitamente.

Após integração, usar contas provisionadas legitimamente: entrar como ADMIN
ativo, iniciar análise, resolver outro relato em análise, rejeitar com
justificativa, consultar cronologia como autor e provar negativas para USER,
SUPER_ADMIN, ADMIN inativo, anônimo e sessão revogada. Conferir disputas entre
administradores/edição/exclusão e recuperação da foto. Demonstrar uma notificação
por evento quando a central estiver integrada. Esse roteiro administrativo
permanece pendente; fixtures de banco não substituem o fluxo real.
