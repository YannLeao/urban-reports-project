# ADR 0012: Validar conteúdo e limitar decodificação de imagens

- Status: aceito
- Data: 2026-09-30

## Contexto

Assinaturas e MIME não comprovam uma fotografia válida. Arquivos pequenos podem
exigir muita memória descomprimidos. O ImageIO padrão não oferece WebP; aceitar
somente o primeiro frame permitiria publicar uma animação não validada.

## Decisão

Evoluir a validação do ADR 0003 para estrutura e decodificação efetiva no servidor.
Preservar JPEG/PNG com leitores JDK e acrescentar somente `imageio-webp` do
TwelveMonkeys 3.15.1 e suas dependências transitivas necessárias (BSD-3-Clause,
Java puro, compatível com Java 21). Nenhum binário nativo WebP é necessário.

O limite inclusivo é **5 MiB / 5.242.880 bytes**, esclarecendo o antigo “5 MB”.
Verificar lados até 8192 e largura × altura até 25.000.000 em `long` antes da
alocação dos pixels. Validar chunks/CRC/finalização PNG e comprimentos RIFF WebP;
recusar APNG, WebP animado e múltiplas imagens. Recusar warnings do decoder,
inclusive recuperação de JPEG incompleto. Conferir formato detectado/MIME.

Ler o multipart para um único array limitado, reutilizado na inspeção e no
upload. O stream de ImageIO referencia esse array sem cache/cópia integral.
Limitar leituras acumuladas a 128 MiB, operações a 2.000.000 e verificar prazo de
5 segundos a cada operação de I/O e após decodificar. Liberar reader, stream e
pixels. Esse prazo não interrompe trabalho exclusivamente de CPU; não usar Future
com timeout como promessa de interrupção. Não há limite agregado de concorrência
ou sandbox de decoder nesta entrega: dimensionar heap/processo e capacidade do
serviço antes de aumentar concorrência de uploads.

## Consequências

Imagens grandes em resolução, animadas, corrompidas ou recuperadas parcialmente
passam a ser recusadas. O novo limite é informado no contrato e no erro de campo.
A sonda `ImageDecoderRuntimeProbe` verifica os três formatos e uma PNG de 25 MP
no runtime Docker; medições e recursos efetivos pertencem à MR.

Os bytes originais continuam privados no storage: enquadramento, orientação e
metadados são preservados. A decodificação não é antivírus nem anonimização.
Sanitização de EXIF e privacidade exigem contrato antes da publicação R07.
Recuperação durável de uploads será uma decisão própria da próxima correção;
este ADR não altera transações nem promete atomicidade R2/PostgreSQL.

Referências: [TwelveMonkeys](https://github.com/haraldk/TwelveMonkeys),
[licença da versão](https://github.com/haraldk/TwelveMonkeys/blob/twelvemonkeys-3.15.1/LICENSE.txt),
[RIFF WebP](https://developers.google.com/speed/webp/docs/riff_container).
