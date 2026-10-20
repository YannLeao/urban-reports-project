# Feedbacks e fronteiras do preview

O [preview](preview.html) representa a direção visual de Alô Cidade. Os guias e
código funcionais definem os contratos atuais. A síntese abaixo omite os dados
pessoais e as capturas da referência de feedback, mantida em pasta temporária.

| Feedback | Correção ou situação | Onde revisar |
| --- | --- | --- |
| Rolagem horizontal em filtros | Selects independentes, rotulados; índice/tabelas viram linhas identificadas, painel empilha colunas no mobile | Relatos públicos, Mapa público, fila, índice; 360 px e zoom 200% |
| Ajuda na nova senha | Critério real de 15–128 caracteres Unicode, espaços aceitos, sem mistura obrigatória | Nova senha, cadastro e ativação; mostrar/ocultar inclusive confirmação |
| Continuidade no aviso de proximidade | “É outro relato, continuar” e “Revisar meu relato”; indisponibilidade permite envio explícito | Até cinco ativos da mesma categoria em 100 m; revisão antes de upload, conforme ADR 0026 |
| Prioridade por repetição | Ponto de alinhamento; sem enum ou cálculo novo | Definir regra com produto antes de prometer criticidade |
| Voltar no detalhe administrativo | Link antes do identificador, incluindo variação de rejeição | Detalhe e ações / Rejeitar com explicação → fila |
| Motivos de rejeição horizontais | Select opcional; não preenche nem substitui a explicação humana de 10–500 caracteres | Rejeitar com explicação; digitar texto e trocar motivo |
| Mapa junto à fila administrativa | Pendente de priorização; aplicação atual tem somente mapas públicos/próprios e localização no detalhe | Não há botão operacional de mapa na fila do preview |
| Vídeo | Backlog, excluído desta etapa | Sem controle de upload de vídeo |
| PDF e filtros de datas | Backlog, excluído desta etapa | Sem exportação ou filtros de período |

## Contratos conferidos

- Categorias: oito IDs/rótulos de `V4__create_occurrences.sql`, sem renumeração.
- Descrição opcional, até 1000 caracteres; localização confirmada manualmente,
  GPS sugerido uma vez na primeira visita à localização do cadastro, com confirmação
  explícita e controle integrado ao mapa; edição usa tentativa voluntária. O formulário
  real tem quatro etapas, com semelhantes na revisão e sem inputs de coordenadas.
- Convite administrativo de 24 horas, uso único. Recuperação de senha é uma
  integração futura; seus exemplos não comprovam rota funcional ou envio de e-mail.
- Histórico contém transições de moderação. Criação é um dado do relato, sem
  evento administrativo inventado. Estados não expressam prioridade.
- Relatório tem três indicadores. “Sem dados” aparece em variante de média sem
  base válida, e não como um quarto indicador fixo.
- Pinos de categoria são snapshots gerados do componente React canônico,
  com estado filtrado separadamente e contorno para seleção.

## Achados para a auditoria de UI/UX

A revisão integral das telas reais é posterior. Conferir aplicação dos controles
de senha em todos os formulários, navegação de retorno no detalhe administrativo
e disposição dos filtros em tamanhos/zooms diversos. O formulário real não tem
aviso preventivo de relatos parecidos; o preview orienta sua interação futura,
sem alterar a regra do backend nesta entrega. A central de avisos continua
separada; o preview não promete entrega de notificações ao autor.

O mapa estático do preview é ilustrativo e não opera GPS/tiles; a fonte dos
pinos é compartilhada, não a implementação do mapa. Não confundir revisão desse
documento com aceite publicado, teste de integração ou aprovação do professor.
