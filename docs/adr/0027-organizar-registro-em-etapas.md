# ADR 0027: Organizar registro em etapas e sugerir localização na primeira visita

- Status: aceito
- Data: 2026-10-20
- Referência: #51; evolui ADR 0018 e integra ADRs 0024, 0025 e 0026

## Contexto

O formulário longo mistura seleção de mídia, localização e textos, com revisão
transitória de semelhantes antes do upload. A #51 define quatro etapas para cadastro
e edição e altera deliberadamente a entrada de localização antes opt-in/textual.

## Decisão

Manter uma página/rascunho estáveis nas rotas atuais, com quatro etapas: mídia,
localização, informações e revisão. Montar etapa na primeira visita e mantê-la
montada, hidden/inert quando inativa, sem atividade de GPS/consulta/player oculto.
Primeira seleção local válida avança cadastro uma vez; edição e retorno não avançam
por mídia existente. Validar por etapa e revalidar tudo antes da única escrita final.
Reutilizar formatos/manifesto/transporte de mídia e consulta de semelhantes existentes.

Na primeira entrada visível de cadastro sem ponto, tentar GPS uma única vez,
com timeout, apenas como sugestão. Edição usa tentativa voluntária. Confirmar
explicitamente ou escolher por mapa; mover/recentralizar não confirma. Controle
com ícone de localização dentro do mapa é acessível em todos os breakpoints.
Remover entradas de latitude/longitude do cadastro/edição; teclado usa setas e
Enter no mapa. WGS84/validação/backend permanecem, incluindo legado sem ponto.
Callbacks tardios são ignorados por geração, sem alegar cancelamento nativo do GPS.
Falhas mantêm rascunho e oferecem retry; sem mapa/sugestão não se fabrica ponto.

Revisão usa capa já carregada em callback limitado à página e placeholder de vídeo,
sem outro picker/download/player. Preservar URLs concluídas em navegação e cancelar
requests não úteis; liberar recursos em remoção/troca/sucesso/unmount. Pausar vídeo
oculto. Cache de semelhantes permanece por usuário/critérios exatos e é cancelado
ao sair; Strict Mode não deve duplicar request útil. Sem estado persistido novo.

## Consequências

Uma tarefa por vez no celular, progresso textual e foco em título/erro. Etapas
visitadas podem ser corrigidas e revisão revalidada diretamente, sem impor novo
percurso integral. Semelhantes integram etapa 4; nenhum upload antes da ação final,
associação de duplicidade ou quinta etapa. Versão da edição permanece congelada.

Links de saída alterada pedem confirmação e beforeunload usa proteção nativa quando
suportada. Histórico do navegador continua sujeito aos limites do Router declarativo;
sem autosave, recuperação após logout ou refatoração do roteador. Projeção do mapa
não oferece entrada textual para polos. GPS/câmera reais e deploy requerem aceite
separado dos testes controlados. [Contrato e roteiro](../report-wizard.md).
