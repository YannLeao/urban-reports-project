import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Select, Textarea } from '../components/ui/Field'
import { ImagePicker } from '../features/image/ImagePicker'
import { validateImageFile } from '../features/image/image-file'
import { useAuth } from '../features/auth/auth'
import { PrivateRequestError } from '../lib/api'

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
    if (title.trim().length < 5 || title.trim().length > 100) next.title = 'Use entre 5 e 100 caracteres.'
    if (description.trim().length < 20 || description.trim().length > 1000) next.description = 'Use entre 20 e 1000 caracteres.'
    if (neighborhood.trim().length < 2 || neighborhood.trim().length > 100) next.neighborhood = 'Use entre 2 e 100 caracteres.'
    if (reference.trim().length < 5 || reference.trim().length > 200) next.reference = 'Use entre 5 e 200 caracteres.'
    if (!image) next.image = 'Escolha exatamente uma imagem.'
    else {
      const reason = validateImageFile(image)
      if (reason) next.image = reason
    }
    return next
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length || !image) return
    setPending(true)
    const body = new FormData()
    body.append('categoryId', categoryId)
    body.append('title', title.trim())
    body.append('description', description.trim())
    body.append('neighborhood', neighborhood.trim())
    body.append('reference', reference.trim())
    body.append('image', image, image.name)
    try {
      const response = await request('/api/occurrences', 'POST', undefined, body)
      const result = occurrenceSchema.parse(await response.json())
      setNotice(`Ocorrência ${result.id} registrada e encaminhada para análise.`)
      setCategoryId(''); setTitle(''); setDescription(''); setNeighborhood(''); setReference(''); setImage(null); setErrors({})
    } catch (error) {
      if (error instanceof PrivateRequestError) {
        const serverErrors = error.fieldErrors ?? {}
        setErrors(Object.fromEntries(Object.entries(serverErrors).map(([key, values]) => [key, values[0]])) as Errors)
        if (!Object.keys(serverErrors).length) setNotice('Não foi possível enviar agora. Tente novamente.')
      } else setNotice('Não foi possível enviar agora. Tente novamente.')
    } finally { setPending(false) }
  }

  return <section className="py-8" aria-labelledby="report-title">
    <div className="max-w-reading">
      <p className="mb-2 text-small font-bold text-brand-default">Registro cidadão</p>
      <h1 id="report-title">Registrar um problema urbano</h1>
      <p className="text-lead text-text-secondary">Conte o que aconteceu e indique um ponto de referência para a equipe localizar o problema.</p>
      {notice && <Alert className="mt-6" tone={notice.startsWith('Ocorrência') ? 'success' : 'danger'} role="status">{notice}</Alert>}
      <Card className="mt-6">
        <form className="grid min-w-0 gap-5" onSubmit={event => { void submit(event) }} noValidate>
          <Select label="Categoria" value={categoryId} error={errors.categoryId} disabled={loadingCategories || pending} onChange={event => setCategoryId(event.target.value)}>
            <option value="">Selecione uma categoria</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
          <Input label="Título" value={title} error={errors.title} minLength={5} maxLength={100} disabled={pending} onChange={event => setTitle(event.target.value)} />
          <Textarea label="Descrição" value={description} error={errors.description} minLength={20} maxLength={1000} disabled={pending} onChange={event => setDescription(event.target.value)} />
          <Input label="Bairro" value={neighborhood} error={errors.neighborhood} minLength={2} maxLength={100} disabled={pending} onChange={event => setNeighborhood(event.target.value)} />
          <Input label="Ponto de referência" description="Informe rua, número, esquina ou outro detalhe que ajude a encontrar o local." value={reference} error={errors.reference} minLength={5} maxLength={200} disabled={pending} onChange={event => setReference(event.target.value)} />
          <div className={errors.image ? 'rounded-control border border-feedback-danger-foreground p-3' : ''}>
            <p className="mb-2 font-bold">Foto do problema</p>
            <ImagePicker value={image} onChange={setImage} />
            {errors.image && <p className="mt-2 text-small text-feedback-danger-foreground" role="alert">{errors.image}</p>}
          </div>
          <Button type="submit" loading={pending} disabled={loadingCategories}>{pending ? 'Enviando…' : 'Enviar ocorrência'}</Button>
        </form>
      </Card>
    </div>
  </section>
}
