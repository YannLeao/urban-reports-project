# 0029 — Filtros e consulta administrativa de finalizados

- Estado: Aceito
- Data: 2026-10-20

## Contexto

Listas e mapas precisam consultar a mesma seleção de categoria/estado antes das
contagens/páginas. O mantenedor decidiu incluir consulta de relatos finalizados
na administração, preservando a fila e sem introduzir transições de reabertura.

## Decisão

Categoria/estado opcionais por AND com as restrições obrigatórias. Público usa
lista explícita PENDING/IN_ANALYSIS/RESOLVED, próprios derivam autor da sessão.
Catálogo público aditivo expõe somente id/name da fonte existente.

Consulta ADMIN ACTIVE oferece scope QUEUE (padrão compatível: abertos) e ALL
(quatro estados). Mesma autorização/revalidação e ordem crescente em ambos.
SUPER_ADMIN não herda acesso; finalizados permanecem finais. Não há mapa admin.

Preservamos ADR0019: marcadores representam o conjunto filtrado completo,
contando legado sem ponto na mesma instrução. Lista e mapa não prometem snapshot
simultâneo. URL é fonte dos filtros; keys incluem critérios normalizados e escopo,
com prefixos para invalidar variantes ativas/inativas e cancelamento existente.

## Consequências

API permanece compatível sem filtros. Backend valida chamadas diretas; frontend
normaliza URLs inválidas com aviso, preserva navegação e evita placeholder entre
seleções. Consulta de finalizados não muda domínio, moderação, indicadores ou PDF.
Não há migration/índice preventivo; EXPLAIN em banco descartável orienta eventual
mudança futura. Publicar API antes do frontend; homologação externa é separada.
