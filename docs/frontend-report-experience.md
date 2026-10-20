# Registro, acompanhamento e painéis

A interface reutiliza a [navegação por perfil](frontend-navigation.md) e o
[design system](design-system/README.md). Os contratos HTTP e as permissões
continuam definidos nos guias de cada domínio.

## Registro e fotografia

`ReportOccurrencePage` mantém um único formulário e o mesmo estado durante
registro/edição, em [quatro etapas](report-wizard.md): mídia, localização, informações
e revisão. A primeira mídia local válida avança cadastro uma vez; retorno/edição
usam Continuar. Etapas visitadas ficam montadas e ocultas/inativas ao sair.
Não há persistência adicional do rascunho.
A fotografia e o ponto existentes são restaurados na edição; trocar fotografia
é opcional. Confirmação do servidor, If-Match, conflito, incerteza e journal
seguem [registro](occurrence-registration.md) e [consulta privada](occurrence-query.md).
Falhas mantêm o rascunho em memória; sair/recarregar perde alterações locais.

O `PhotoCollectionPicker` permite galeria múltipla e captura incremental, com
contador 1–5 e prévias inteiras. A primeira foto é a capa. Botões acessíveis movem,
definem capa e removem itens da coleção final; remover uma foto existente agenda
seu descarte quando a edição confirma. Cancelar/seleção inválida preserva a coleção.
Não exibe nome original/bytes como conteúdo. Formatos e 5 MiB por arquivo permanecem;
captura depende do navegador. Não há compressão, limpeza EXIF ou garantia de câmera
nativa. `ImagePicker` singular continua na prova independente `/prova-imagem`.
[Contrato de coleção](multiple-photos.md) descreve manifesto, galeria e limpeza.

## Localização e acesso

Na primeira entrada na localização de cadastro sem ponto, GPS é tentado uma vez
como sugestão, com confirmação explícita. Edição usa GPS voluntário. Controle com
ícone dentro do mapa fica disponível no celular/desktop. Toque ou setas + Enter
confirmam; arrastar/recentralizar não altera o ponto. Sem entrada numérica no
cadastro/edição, nem coordenadas brutas na revisão. Falhas e callbacks tardios
preservam escolhas anteriores; veja [localização](occurrence-location.md).

Login, cadastro e ativação usam o [PasswordField compartilhado](design-system/componentes.md#passwordfield).
Cada campo tem controle independente. A política de criação continua de 15 a
128 caracteres Unicode, sem trim ou exigência de composição. Login não passa a
validar política de criação. O cadastro não autentica: após sucesso convida a
entrar e preserva o destino seguro recebido do login.

A [central de notificações](notifications.md) substitui o acesso de preparação
pelo sino funcional para USER, com contagem global de não lidas e lista paginada.
A recuperação de senha continua como acesso indisponível; sua integração deve
usar PasswordField para novas senhas quando houver destino real.

## Consulta e acompanhamento

Listas priorizam foto, título, estado, bairro e data resumida. Referência completa
e horário exato ficam no detalhe. Fotos continuam lazy; a consulta de marcadores
não passa a carregar fotografias. URLs privadas são temporárias, em memória,
com cancelamento e revogação no ciclo de vida existente.

O detalhe próprio aproxima o último evento real do conteúdo, destaca a razão
real de rejeição e mantém o histórico integral na ordem fornecida pela API.
Não cria evento inicial. Editar/excluir aparecem somente em PENDING; exclusão
mantém diálogo identificando o relato, irreversibilidade, foco em Cancelar e
retorno ao acionador. Mapa fica em expansão secundária, com coordenadas textuais;
legado sem ponto continua identificado. O público não recebe histórico/autoria.

## Painéis

ADMIN usa fila de linhas compactas no desktop e cards no mobile; foto permanece
sob demanda, com ordem e paginação da API. `?pagina=N` preserva a página no
retorno do detalhe e em refresh. Não há novos filtros ou busca. Detalhe distribui
evidência e decisões em colunas no desktop, mantendo ordem linear no mobile,
foco/contador/erros de rejeição e aviso de que o autor verá a justificativa.
Não há mapa administrativo.

O relatório destaca somente total, média de resolução e proporção de rejeitadas.
Definições, valor bruto em segundos e amostra ficam em expansão acessível;
avisos de média parcial/atualização falha continuam visíveis. Zero, ausência e
erro permanecem distintos. [Fórmulas e população](occurrence-report.md) não mudam.

SUPER_ADMIN consulta a lista sem percorrer formulário vazio. “Criar administrador”
abre seção com foco no nome; fechar preserva o rascunho, sucesso fecha a seção e
renova a lista. Falhas/incerteza de e-mail e confirmação de desativação seguem
[provisionamento](admin-provisioning.md). Não há promoção ou herança de ADMIN.

Seleção de fotografias no produto usa `PhotoCollectionPicker` (1–5, ordenação/capa), reutilizado no Wizard; detalhes usam `OccurrenceGallery`. Prova singular permanece independente. [Contrato, roteiro e limites](multiple-photos.md).


## Alternativa de vídeo

`MediaPicker` acrescenta modo exclusivo vídeo à composição existente, sem etapas
novas. A troca de tipo pede confirmação e só persiste com sucesso do envio.
`OccurrenceGallery` discrimina VIDEO para player sob demanda; cards/mapas mostram
placeholder e duração, sem foto fictícia. [Contrato e operação](occurrence-video.md).

## Sugestões por proximidade

O formulário de cadastro/edição oferece revisão informativa antes da gravação.
`POST /api/occurrences/similar` é consulta JSON exclusiva de USER ativo, sem upload,
com 100 m/mesma categoria/ativos/até cinco e exclusão própria na edição.
Contrato, minimização, falhas, integração futura e roteiro em
[sugestões de relatos próximos](similar-occurrences.md).
