# ADR 0026: Alertar relatos por categoria e proximidade

- Status: aceito
- Data: 2026-10-20
- Referência: #22; complementa ADRs 0018 e 0019

## Contexto

RN-20 originalmente compara categoria, bairro e referência normalizados. A regra
aprovada para #22 substitui deliberadamente essa comparação textual por categoria
persistida e proximidade ao ponto confirmado. O domínio atual não tem modalidade
privada/publicável; a consulta pública exclui REJECTED.

## Decisão

Consultar no PostgreSQL a mesma categoria, somente PENDING/IN_ANALYSIS elegíveis
publicamente, a até 100 metros inclusivos. Haversine usa raio terrestre médio de
6.371.008,8 metros e argumento limitado a [0,1] antes de sqrt/asin. Não arredondar
na filtragem/ordenação. Sem bounding box, PostGIS ou comparação textual adicional.
Coordenadas nulas/inválidas ficam fora; polos e antimeridiano são admitidos.
Ordenar por distância ASC, createdAt DESC, id DESC, depois limitar a cinco.
Excluir o relato próprio na edição antes do limite, validando ownership uniforme.
Usar projeção JDBC mínima e índice existente de categoria; novos índices exigem
medição em base representativa descartável, sem SLA inferido de uma execução local.

POST /api/occurrences/similar é somente leitura, exclusivo de USER ativo com
sessão revogável. JSON estrito limitado a 8192 bytes efetivamente lidos, sem
coerção numérica, propriedades duplicadas ou filtros arbitrários. Coordenadas
ficam no corpo, nunca em query; respostas e erros são no-store. Não registrar
corpo, identificadores, textos ou exceções brutas. Retornar apenas campos públicos
textuais e distância, sem identidade, mídia ou coordenadas do candidato.
Persistência indisponível retorna 503 sanitizado, nunca lista vazia.

O aviso sugere candidatos; não comprova duplicidade nem bloqueia negócio. Não
persistir associação/flag, exigir justificativa, alterar estados ou prioridades.
Bairro/referência não participam da busca. Categoria Outro usa a mesma regra.
Legado sem ponto permite edição existente e informa consulta não executada.

## Consequências

Formulário completo validado abre revisão sem upload. Só confirmação final explícita
revalida e grava com contrato multipart/If-Match vigente. Falha auxiliar permite
retry manual ou envio explícito; 401 encerra sessão e 403 informa acesso negado.
Mudança dos critérios invalida revisão; consulta tem timeout de 10 segundos,
cache efêmero por usuário/critérios exatos, cancelamento, sem retry/polling/refetch
por foco ou reconexão. Links públicos abrem nova aba para preservar rascunho.
Resultado já recebido não é apagado retroativamente por rejeição, mas detalhe e
mídia públicos continuam revalidando a elegibilidade em cada requisição.

Hook e painel independem do layout do formulário. #51 pode montá-los na revisão
sem duplicar SQL, chamada autenticada ou formulário. Esta decisão não implementa
Wizard nem altera GPS, mídia, CRUD, idempotência ou visibilidade global.
