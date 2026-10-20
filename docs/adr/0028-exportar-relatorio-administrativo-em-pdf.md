# ADR 0028: Exportar relatório administrativo em PDF

- Status: aceito
- Data: 2026-10-20
- Complementa: ADRs 0008, 0011, 0017 e 0020

## Contexto

ADMIN precisa baixar os agregados globais existentes em um documento legível,
sem enviar números do navegador, expor ocorrências individuais ou depender de
serviço de impressão externo. A exportação pode ocorrer depois da consulta
exibida no dashboard e durante alterações concorrentes.

## Decisão

Gerar A4 retrato com Apache PDFBox 3.0.8 no backend Java 21. O endpoint GET exato
`/api/admin/reports/occurrences/pdf` exige ADMIN ativo e sessão revogável. Uma
chamada ao bean proxied `OccurrenceReportService.get` produz nova leitura
consistente conforme ADR 0017; sua transação termina antes de desenhar o PDF.
O renderizador recebe somente um Report com coleções imutáveis e o instante de
geração vindo de Clock. Não executa SQL, I/O remoto nem recalcula indicadores.

Embute Figtree TTF estática regular/bold (OFL 1.1), símbolo derivado do favicon
e cores dos tokens canônicos, todos no classpath do JAR. Texto é selecionável,
com barras vetoriais, localidades completas e paginação. Referência dos dados
e geração são distintas, em America/Sao_Paulo com offset; nomes de arquivo
usam UTC. Glifos indisponíveis/controles aparecem como `[U+XXXX]`, com nota.

Uma vaga por instância cobre leitura/montagem, com tentativa imediata e sem fila.
Limites iniciais: 512 páginas, 16 MiB de saída e orçamento cooperativo de 30 s
no layout. Exceder capacidade retorna 503 `REPORT_PDF_CAPACITY`, sem truncamento.
O arquivo completo precede headers de sucesso. O limite de bytes não limita o
heap total: snapshot, estruturas PDFBox, fontes, saída e cópia de retorno coexistem;
consultas e downloads lentos têm seus próprios custos. Reavaliar no ambiente alvo.

Frontend usa requisição imperativa sem retry, AbortSignal, contexto de sessão,
limite de 16 MiB na leitura até EOF e validação de MIME/assinatura/fim do PDF.
Não põe binário no cache Query/storage. Download não atualiza o dashboard.

## Consequências

Sem migrations, bucket, cache/histórico, filtros, navegador no backend ou biblioteca
PDF no bundle. Recursos precisam acompanhar o contexto Docker backend e ter
paridade verificada após mudanças de identidade. Recursos finitos podem recusar
exportações grandes; nunca esconder grupos para fazer caber. Uma vaga é local,
não um limite global do cluster ou de todos os downloads em andamento.

Revogação impede próximas consultas, sem apagar um arquivo já entregue. Nomes
de localidades são texto livre, portanto agregação não certifica anonimização.
Sem alegação PDF/A, PDF/UA ou acessibilidade certificada. Contrato, preparação e
validação em [relatório](../occurrence-report.md) e [assets](../report-pdf-assets.md).
