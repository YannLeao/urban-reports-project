import { useEffect, useRef, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ImagePicker } from '../features/image/ImagePicker'
import { validateImageFile } from '../features/image/image-file'
import { useAuth } from '../features/auth/auth'
import { PrivateRequestError } from '../lib/api'
import { cleanOccurrenceText, validOccurrenceText } from '../features/occurrence/occurrence-text'

const categoriesSchema = z.array(z.object({ id: z.number(), name: z.string() }))
const occurrenceSchema = z.object({ id: z.uuid(), status: z.literal('PENDING') })
type FieldName = 'categoryId' | 'title' | 'description' | 'neighborhood' | 'reference' | 'image'
type Errors = Partial<Record<FieldName, string>>

export function ReportOccurrencePage() {
  const { request } = useAuth()
  const [categories, setCategories] = useState<z.infer<typeof categoriesSchema>>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [reference, setReference] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const validatingImage = useRef(false)
  const [imageBusy, setImageBusy] = useState(false)
  const feedback = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (notice) feedback.current?.focus()
    else if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [notice, errors])

  useEffect(() => {
    const controller = new AbortController()
    void request('/api/occurrence-categories', 'GET', controller.signal)
      .then(response => response.json())
      .then(payload => setCategories(categoriesSchema.parse(payload)))
      .catch(() => { if (!controller.signal.aborted) setErrors({ categoryId: 'Não foi possível carregar as categorias.' }) })
      .finally(() => { if (!controller.signal.aborted) setLoadingCategories(false) })
    return () => controller.abort()
  }, [request])

  function validate(): Errors {
    const next: Errors = {}
    if (!categoryId) next.categoryId = 'Escolha uma categoria.'
    if (!validOccurrenceText(title, 5, 100)) next.title = 'Use entre 5 e 100 caracteres.'
    if (!validOccurrenceText(description, 20, 1000)) next.description = 'Use entre 20 e 1000 caracteres.'
    if (!validOccurrenceText(neighborhood, 2, 100)) next.neighborhood = 'Use entre 2 e 100 caracteres.'
    if (!validOccurrenceText(reference, 5, 200)) next.reference = 'Use entre 5 e 200 caracteres.'
    if (!image) next.image = 'Escolha exatamente uma imagem.'
    else {
      const reason = validateImageFile(image)
      if (reason) next.image = reason
    }
    return next
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || validatingImage.current || loadingCategories) return
    setNotice(null)
    setSuccess(false)
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length || !image) return
    submitting.current = true
    setPending(true)
    const body = new FormData()
    body.append('categoryId', categoryId)
    body.append('title', cleanOccurrenceText(title))
    body.append('description', cleanOccurrenceText(description))
    body.append('neighborhood', cleanOccurrenceText(neighborhood))
    body.append('reference', cleanOccurrenceText(reference))
    body.append('image', image, image.name)
    try {
      const response = await request('/api/occurrences', 'POST', undefined, body)
      if (response.status !== 201) throw new Error('Unconfirmed response')
      const result = occurrenceSchema.parse(await response.json())
      setSuccess(true)
      setNotice(`Ocorrência ${result.id} registrada e encaminhada para análise.`)
      setCategoryId(''); setTitle(''); setDescription(''); setNeighborhood(''); setReference(''); setImage(null); setErrors({})
    } catch (error) {
      const mapped: Errors = {}
      if (error instanceof PrivateRequestError) {
        for (const key of Object.keys(error.fieldErrors ?? {})) {
          if (key === 'categoryId') mapped.categoryId = 'Escolha uma categoria válida.'
          else if (key === 'title') mapped.title = 'Use entre 5 e 100 caracteres.'
          else if (key === 'description') mapped.description = 'Use entre 20 e 1000 caracteres.'
          else if (key === 'neighborhood') mapped.neighborhood = 'Use entre 2 e 100 caracteres.'
          else if (key === 'reference') mapped.reference = 'Use entre 5 e 200 caracteres.'
          else if (key === 'image') mapped.image = 'Escolha uma foto estática JPEG, PNG ou WebP de até 5 MiB, com lados até 8192 pixels e até 25 milhões de pixels. A imagem deve estar completa e legível.'
        }
        if (error.status === 401) setNotice('Sua sessão terminou. Entre novamente para registrar a ocorrência.')
        else if (error.status === 413 || error.code === 'IMAGE_TOO_LARGE') setNotice('A imagem ou o envio excedeu o limite. Escolha uma foto de até 5 MiB.')
        else if (error.code === 'IMAGE_STORAGE_UNAVAILABLE') setNotice('O serviço de fotos está indisponível. Seus dados foram mantidos; tente novamente mais tarde.')
        else if (error.status === 400) setNotice('Não foi possível enviar. Confira os campos e a fotografia antes de tentar novamente.')
        else setNotice('O serviço não confirmou o registro. Seus dados foram mantidos. Tentar novamente pode criar uma ocorrência duplicada.')
      } else setNotice('Não foi possível confirmar o registro. Confira sua conexão. Seus dados foram mantidos; reenviar pode criar uma ocorrência duplicada.')
      setErrors(mapped)
    } finally { submitting.current = false; setPending(false) }
  }

  return <section className="py-8" aria-labelledby="report-title">
    <div className="max-w-reading">
      <p className="mb-2 text-small font-bold text-brand-default">Registro cidadão</p>
      <h1 id="report-title">Registrar um problema urbano</h1>
      <p className="text-lead text-text-secondary">Conte o que aconteceu e indique um ponto de referência para a equipe localizar o problema.</p>
      {notice && <Alert ref={feedback} tabIndex={-1} className="mt-6" tone={success ? 'success' : 'danger'} role={success ? 'status' : 'alert'}>{notice}</Alert>}
      <Card className="mt-6">
        <form ref={form} aria-busy={pending} className="grid min-w-0 gap-5" onSubmit={event => { void submit(event) }} noValidate>
          <Select label="Categoria" value={categoryId} error={errors.categoryId} disabled={loadingCategories || pending} onChange={event => setCategoryId(event.target.value)}>
            <option value="">Selecione uma categoria</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
          <Input label="Título" value={title} error={errors.title} disabled={pending} onChange={event => setTitle(event.target.value)} />
          <Textarea label="Descrição" value={description} error={errors.description} disabled={pending} onChange={event => setDescription(event.target.value)} />
          <Input label="Bairro" value={neighborhood} error={errors.neighborhood} disabled={pending} onChange={event => setNeighborhood(event.target.value)} />
          <Input label="Ponto de referência" description="Informe rua, número, esquina ou outro detalhe que ajude a encontrar o local." value={reference} error={errors.reference} disabled={pending} onChange={event => setReference(event.target.value)} />
          <div className={errors.image ? 'rounded-control border border-feedback-danger-foreground p-3' : ''}>
            <p className="mb-2 font-bold">Foto do problema</p>
            <ImagePicker value={image} onChange={setImage} disabled={pending} onValidationChange={busy => {
              validatingImage.current = busy
              setImageBusy(busy)
            }} />
            {errors.image && <p className="mt-2 text-small text-feedback-danger-foreground" role="alert">{errors.image}</p>}
          </div>
          <Button type="submit" loading={pending} disabled={loadingCategories || imageBusy || pending}>{pending ? 'Enviando…' : 'Enviar ocorrência'}</Button>
        </form>
      </Card>
    </div>
  </section>
}
