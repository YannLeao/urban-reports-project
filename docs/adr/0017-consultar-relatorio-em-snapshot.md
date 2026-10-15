# ADR 0017: Consultar relatório administrativo em snapshot

- Status: aceito
- Data: 2026-10-15
- Complementa: ADRs 0011, 0014, 0015 e 0016

## Contexto

O relatório global combina contagens, distribuições e média de resolução durante
edições, exclusões e moderação concorrentes. READ COMMITTED com múltiplos SELECTs
pode devolver indicadores de populações diferentes. O lock de conta utilizado
por comandos administrativos bloquearia moderação durante a leitura.

## Decisão

Usar transação própria somente de leitura com REPEATABLE READ no PostgreSQL,
incluindo revalidação de ADMIN ativo/sessão e todas as consultas agregadas.
Não adquirir locks de escrita. Reutilizar o modelo de identidade e a política
de requisições em andamento do ADR 0011: desativação confirmada impede novas
leituras, mas não cancela retroativamente um snapshot autorizado.

Contar occurrences atualmente persistidas, incluindo rejeitadas, sem
reconstruir exclusões físicas. Agrupar histórico antes da média e excluir
resolvidas inconsistentes, informando amostra e exclusões. A máquina sem reabertura
exige um único evento final compatível com estado/versão atuais. Não inferir
instantes ausentes nem reparar auditoria durante leitura.

## Consequências

Consistência sem serializar moderação; leituras longas mantêm snapshot até o
fim da resposta. A implementação usa quantidade fixa de consultas e retorna
somente agregados com no-store. Sem tabelas analíticas, novas migrations,
índices especulativos, polling ou dependência de imagens/e-mail. Futuras mudanças
de máquina de estados devem revisar a elegibilidade das durações.
Contrato, fórmulas e limitações em [relatório](../occurrence-report.md).
