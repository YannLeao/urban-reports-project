# ADR 0030: Polir a mídia e atualizar consultas visíveis

- Status: aceito
- Data: 2026-10-23
- Referência: #55; evolui UX das ADRs 0017, 0019, 0024, 0025 e 0027

## Contexto

A seleção em cards repetidos, instruções e atalhos duplicados consomem espaço
mobile. O avanço após selecionar mídia impede compor o conjunto antes de seguir.
Consultas sem refresh automático exigem ação para ver mudanças de outros clientes.

## Decisão

Cadastro/edição usam avanço manual, inclusive após primeira seleção. Progresso
compacto conserva retornos e revisão explícita. Uma entrada visual abre captura
nativa com menu Fotografar/Gravar vídeo e alternativa Galeria. Tipo vem do lote;
lotes mistos/múltiplos vídeos são recusados e troca de tipo exige confirmação.
Capture traseiro é preferência do navegador, sem gravador próprio, conversão ou
garantia universal. Contratos JPEG/PNG/WebP e MP4 H.264/AAC não mudam.

Editor mostra uma foto inteira e miniaturas horizontais. Navegar não reordena;
capa e ordem são ações separadas. Slots de mídia preservam File/ID/URL por chave,
sem baixar fotos privadas só para miniaturas. Conta contém identidade e Sair;
destinos permanecem no shell. Mapas integram GPS/enquadrar sem refresh permanente;
relatório mantém PDF manual e explicação de novo snapshot no disclosure.

Consultas de lista pública/própria, marcadores ativos e fila administrativa usam
60 s de intervalo e 30 s de staleTime; relatório JSON usa 120 s/60 s. Somente rota,
visão, sessão e papel ativos com aba visível e conexão disponível. React Query
v5 e seus managers/observer gerem timers, foco e reconexão; sem timers/listeners
DOM paralelos. Sem polling em detalhes, contas administrativas, Wizard, semelhantes,
upload ou PDF. Mutações invalidam cada prefixo uma vez.

Falhas transitórias usam backoff limitado a 300 s; sucesso restaura intervalo.
Erro de contrato/configuração/HTTP permanente para repetição até retry explícito
ou novo contexto; 403 oculta dados, 401 segue encerramento de sessão. Refresh da
mesma chave conserva dados com aviso, sem reenquadrar ou trocar página/filtros.
Política e roteiro em [consultas vivas](../live-queries.md).

## Consequências

Atualização é eventual, não tempo real/SLA nem capacidade medida. Cada superfície
visível acrescenta no máximo um tick por intervalo saudável; marcadores completos
continuam O(n). Medir payload/latência antes de mudar defaults. Contextos inativos
não geram timers de rede. Foco/reconexão podem revalidar antes do próximo tick se
stale. Exportação consulta snapshot independente e nunca roda automaticamente.

Captura física Android/iOS, codecs gerados e teclado virtual exigem homologação
própria. Não se altera backend/schema/storage nem se reescrevem ADRs históricos.
