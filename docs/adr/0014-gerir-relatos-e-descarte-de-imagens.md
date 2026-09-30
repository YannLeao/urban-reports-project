# ADR 0014: Gerir relatos pendentes e descarte de imagens

- Status: aceito
- Data: 2026-09-30

## Contexto

RF-14/RN-12/RN-13 exigem edição/exclusão pelo autor. O journal do ADR 0013 ignora
LINKED; remover referência sem agendar descarte perde a recuperação da foto antiga.

## Decisão

Adicionar versão BIGINT (V6), exposta no DTO e exigida entre aspas em If-Match.
Bloquear ocorrência por id + autor, revalidar PENDING/versão e incrementar cada
edição. Excluir fisicamente. A nova fotografia tem chave exclusiva e intenção
confirmada antes do upload, que ocorre fora da transação da ocorrência. Link
bloqueia journal PENDING antes de bloquear o relato. Troca/exclusão agenda
TOMBSTONE da chave antiga na mesma transação. Objetos anteriores à V5 entram no
journal apenas quando retirados por uma escrita autorizada, sem varredura.

Recuperador continua bloqueando journal com SKIP LOCKED, verificando referências,
backoff e tombstones permanentes conforme ADR 0013. Escritor só vincula PENDING;
TOMBSTONE impede reutilização/vínculo concorrente durante remoção. Todos os
caminhos de escrita devem respeitar essa coordenação. Uma referência confirmada
prevalece na reconciliação. Nunca apagar foto antiga antes do commit.

## Consequências

Resposta confirma commit do banco, sem depender de DELETE remoto. Falha/perda de
resposta e restart são recuperáveis eventualmente com banco/provedor disponíveis.
Não há transação distribuída, restauração ou remoção imediata garantida. Worker
mantém I/O sob lock do journal e requer dimensionamento operacional do ADR 0013.
Futura moderação deve usar o mesmo bloqueio/versão; consulta pública R07 deve
refletir exclusão e invalidar seu cache próprio. Não é implementada nesta decisão.
