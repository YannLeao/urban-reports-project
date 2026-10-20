# ADR 0025: Validar vídeo limitado e reproduzir por superfície

- Status: aceito
- Data: 2026-10-20
- Referência: #45; complementa ADRs 0013, 0014 e 0024

## Contexto

A coleção V13 aceita somente fotos e materializa downloads em arrays. Vídeo exige
validação real, trabalho limitado, XOR da coleção e transporte sem array integral
no servidor. O elemento video não fornece o Bearer da aplicação.

## Decisão

V14 aceita 1–5 IMAGE OU uma VIDEO com metadados medidos. Serviço revalida a coleção
sob lock; banco verifica cardinalidade/XOR por trigger diferido serializado pelo
relato. Legado e ordem global conta/journals/relato/retiradas permanecem.

Aceitar apenas MP4 H.264 progressivo 8-bit 4:2:0 com AAC-LC opcional, 25 MiB,
30 s, 720p, 30 fps e 900 frames. Inspeção estrutural precede FFprobe, conferência
de frames e FFmpeg com decode estrito até EOF. Uma admissão mantém a cópia
seekable limitada até concluir o upload. Processos sem shell/segredos, saídas
limitadas e prazo combinado de até 30 s. Imagem final inclui ferramentas Alpine.
Não transformar bytes nem extrair poster. Limites e tolerâncias estão no
[contrato operacional](../occurrence-video.md).

Manter ImageStorage como fronteira, acrescentando HEAD e stream abortável com
intervalo explícito. Autorizar antes de I/O e terminar a transação antes da cópia.
Playback limitado por vaga, executor, transporte e async. Público usa GET/HEAD/
Range da aplicação; privado baixa com Bearer e limite durante leitura e cria Blob
após EOF. UI descarta resultados antigos/object URLs ao mudar contexto.

## Consequências

Validação usa CPU/disco/heap e memória nativa; um processo com timeout não é sandbox
nem limite global de memória. Capacidade local não comprova capacidade do Render.
Vídeo privado espera download integral; público permite Range, sem CDN/URL assinada.
Novos requests revalidam acesso; bytes recebidos não podem ser revogados.

Bytes e possíveis metadados pessoais são preservados. Reprodução/captura universal
não é prometida. Publicação exige API/schema/worker antes do frontend e parada
coordenada das versões antigas; preferir recuperação por avanço. Nenhuma mudança
na estratégia de intenção, PUT incerto, tombstone e recuperação eventual.
