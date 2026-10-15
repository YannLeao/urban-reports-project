# Registro, acompanhamento e painéis

A interface reutiliza a [navegação por perfil](frontend-navigation.md) e o
[design system](design-system/README.md). Os contratos HTTP e as permissões
continuam definidos nos guias de cada domínio.

## Registro e fotografia

`ReportOccurrencePage` mantém um único formulário e o mesmo estado durante
registro/edição. A ordem é foto, localização/bairro/referência e categoria/título/
descrição opcional. Não há wizard nem persistência adicional do rascunho.
A fotografia e o ponto existentes são restaurados na edição; trocar fotografia
é opcional. Confirmação do servidor, If-Match, conflito, incerteza e journal
seguem [registro](occurrence-registration.md) e [consulta privada](occurrence-query.md).
Falhas mantêm o rascunho em memória; sair/recarregar perde alterações locais.

O `ImagePicker` prioriza “Tirar foto” com ícone, com “Escolher da galeria” como
alternativa. A prévia mantém a foto inteira, permite nova captura, troca e
remoção da seleção local. Na edição, remover uma nova seleção volta a mostrar
a foto existente; não exclui a foto persistida. Nome/bytes do arquivo não são
conteúdo principal. Formatos, 5 MiB e erros reais permanecem; a captura depende
do navegador. Não há compressão, limpeza de EXIF ou garantia de câmera nativa.
[Seleção de imagem](image-selection-proof.md) descreve validação e limpeza.

## Localização e acesso

GPS é solicitado somente por ação explícita. Uma sugestão válida centraliza o
mapa e aparece como círculo tracejado, separado do pino confirmado. Confirmar
ou tocar/clicar no mapa constitui escolha humana; descartar ou falhar não apaga
o ponto anterior. Mover a visualização não confirma posição. Ao visualizar a
sugestão, o provedor de tiles recebe o novo enquadramento, antes da confirmação;
não recebe texto, foto ou Bearer da API.

“Informar coordenadas” é alternativa expansível, independente dos tiles, com
eixos, unidade, faixas e confirmação. Erro abre a seção e foca o input; erro de
foto no início do formulário tem prioridade de foco. `LocationPicker` aceita
`focusError` (padrão true) para coordenar essa prioridade sem esconder o erro.
O centro de Belo Jardim nunca preenche o payload. Veja [localização](occurrence-location.md).

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
