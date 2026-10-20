import { SimilarOccurrencesReview } from '../features/occurrence/SimilarOccurrencesReview'
import { queryReturn } from '../features/occurrence/map-navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LocationPicker } from '../features/location/LocationPicker'
import type { GeographicPoint } from '../features/location/point'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { buttonStyles } from '../components/ui/button-styles'
import { occurrenceSchema as fullOccurrenceSchema, type Occurrence } from '../features/occurrence/occurrence'
import { Alert } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { OccurrenceStatus } from '../features/occurrence/OccurrenceStatus'
import { Input, Select, Textarea } from '../components/ui/Field'
import { MediaPicker, VIDEO_HELP } from '../features/image/MediaPicker'
import { appendPhotoDraft, type PhotoDraft } from '../features/image/photo-draft'
import { validateImageFile } from '../features/image/image-file'
import { useAuth } from '../features/auth/auth'
import { PrivateRequestError } from '../lib/api'
import { cleanOccurrenceText, validOccurrenceText } from '../features/occurrence/occurrence-text'

const categoriesSchema = z.array(z.object({ id: z.number(), name: z.string() }))
const occurrenceSchema = z.object({ id: z.uuid(), status: z.literal('PENDING') })
type FieldName = 'categoryId' | 'title' | 'description' | 'neighborhood' | 'reference' | 'image' | 'location'
type Errors = Partial<Record<FieldName, string>>

export function ReportOccurrencePage({ existing: initialExisting }: { existing?: Occurrence }) {
  // Freeze the version together with the draft: a background read must not
  // silently upgrade If-Match while retaining text from an older form.
  const [existing] = useState(initialExisting)
  const client = useQueryClient()
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const navigate = useNavigate()
  const navigation = useLocation()
  const from = queryReturn(navigation.state?.from, true)
  const { request, state } = useAuth()
  const [categories, setCategories] = useState<z.infer<typeof categoriesSchema>>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [categoryId, updateCategoryId] = useState(existing?.categoryId.toString() ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [neighborhood, setNeighborhood] = useState(existing?.neighborhood ?? '')
  const [reference, setReference] = useState(existing?.reference ?? '')
  const [location, updateLocation] = useState<GeographicPoint | null>(existing?.latitude != null && existing.longitude != null ? { latitude: existing.latitude, longitude: existing.longitude } : null)
  const [review, setReview] = useState<{ key: string; visible: boolean } | null>(null)
  const criteria = location ? { categoryId: Number(categoryId), ...location, ...(existing ? { excludeOccurrenceId: existing.id } : {}) } : null
  const criteriaKey = JSON.stringify([state.status === 'authenticated' ? state.user.id : null, categoryId, criteria])
  function setCategoryId(value: string) { if (value !== categoryId) setReview(null); updateCategoryId(value) }
  function setLocation(value: GeographicPoint | null) {
    if (value?.latitude !== location?.latitude || value?.longitude !== location?.longitude) setReview(null)
    updateLocation(value)
  }
  const [mode, setMode] = useState<'IMAGE' | 'VIDEO'>(existing?.media?.[0]?.type ?? 'IMAGE')
  const [photos, setPhotos] = useState<PhotoDraft[]>(() => existing?.media?.map(item => ({ key: item.id, id: item.id })) ?? [])
  const [errors, setErrors] = useState<Errors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const validatingImage = useRef(false)
  const [imageBusy, setImageBusy] = useState(false)
  const feedback = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [success, setSuccess] = useState(false)
  const [registered, setRegistered] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    if (notice) feedback.current?.focus()
    else if (errors.image) form.current?.querySelector<HTMLElement>('[aria-label="Selecionar fotografia"] button')?.focus()
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
    if (!validOccurrenceText(description, 0, 1000)) next.description = 'Use no máximo 1000 caracteres.'
    if (!validOccurrenceText(neighborhood, 2, 100)) next.neighborhood = 'Use entre 2 e 100 caracteres.'
    if (!validOccurrenceText(reference, 5, 200)) next.reference = 'Use entre 5 e 200 caracteres.'
    if (!existing && !location) next.location = 'Confirme o local real do problema.'
    if (photos.length < 1 || photos.length > (mode === 'VIDEO' ? 1 : 5)) next.image = mode === 'VIDEO' ? 'Escolha um vídeo.' : 'Escolha de 1 a 5 fotos.'
    for (const item of photos) if (item.file && mode === 'IMAGE') {
      const reason = validateImageFile(item.file)
      if (reason) next.image = reason
    }
    return next
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || validatingImage.current || loadingCategories) return
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) { setReview(null); return }
    // Enter can only open review, never confirm a write.
    setReview({ key: criteriaKey, visible: true })
  }

  async function confirm() {
    if (!review?.visible || review.key !== criteriaKey || state.status !== 'authenticated') return
    if (submitting.current || validatingImage.current || loadingCategories) return
    setNotice(null)
    setSuccess(false)
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) return
    submitting.current = true
    setReview(null)
    setPending(true)
    const body = new FormData()
    body.append('categoryId', categoryId)
    body.append('title', cleanOccurrenceText(title))
    body.append('description', cleanOccurrenceText(description))
    body.append('neighborhood', cleanOccurrenceText(neighborhood))
    body.append('reference', cleanOccurrenceText(reference))
    if (location) { body.append('latitude', location.latitude.toString()); body.append('longitude', location.longitude.toString()) }
    appendPhotoDraft(body, photos, !!existing, mode)
    try {
      const response = await request(existing ? `/api/occurrences/${existing.id}` : '/api/occurrences', existing ? 'PUT' : 'POST', undefined, body, existing ? { 'If-Match': `"${existing.version}"` } : undefined)
      if (response.status !== (existing ? 200 : 201)) throw new Error('Unconfirmed response')
      const payload: unknown = await response.json()
      const result = occurrenceSchema.parse(payload)
      if (!mounted.current || state.status !== 'authenticated') return
      const prefix = ['private', state.user.id, 'occurrences']
      await client.cancelQueries({ queryKey: prefix })
      if (!mounted.current) return
      client.removeQueries({ queryKey: prefix })
      void client.invalidateQueries({ queryKey: ['public', 'occurrences'] })
      if (existing) {
        const updated = fullOccurrenceSchema.parse(payload)
        client.setQueryData([...prefix, existing.id], updated)
        navigate(`/meus-relatos/${existing.id}`, { state: { from } })
        return
      }
      setRegistered({ id: result.id, title })
      setSuccess(true)
      setNotice(null)
      setCategoryId(''); setTitle(''); setDescription(''); setNeighborhood(''); setReference(''); setPhotos([]); setLocation(null); setErrors({})
    } catch (error) {
      const mapped: Errors = {}
      if (error instanceof PrivateRequestError) {
        for (const key of Object.keys(error.fieldErrors ?? {})) {
          if (key === 'location' || key === 'latitude' || key === 'longitude') mapped.location = 'Confirme um par válido de latitude e longitude.'
          else if (key === 'categoryId') mapped.categoryId = 'Escolha uma categoria válida.'
          else if (key === 'title') mapped.title = 'Use entre 5 e 100 caracteres.'
          else if (key === 'description') mapped.description = 'Use no máximo 1000 caracteres.'
          else if (key === 'neighborhood') mapped.neighborhood = 'Use entre 2 e 100 caracteres.'
          else if (key === 'reference') mapped.reference = 'Use entre 5 e 200 caracteres.'
          else if (['image', 'images', 'media'].includes(key)) mapped.image = mode === 'VIDEO' ? VIDEO_HELP : 'Escolha uma foto estática JPEG, PNG ou WebP de até 5 MiB, com lados até 8192 pixels e até 25 milhões de pixels. A imagem deve estar completa e legível.'
        }
        if (error.code === 'INVALID_VIDEO') setNotice(VIDEO_HELP + ' O arquivo deve estar completo e legível.')
        else if (error.code === 'VIDEO_VALIDATION_BUSY' || error.code === 'VIDEO_VALIDATION_UNAVAILABLE' || error.code === 'MEDIA_BUSY') setNotice('O serviço de mídia está indisponível ou ocupado. Seu rascunho foi mantido; tente novamente mais tarde.')
        else if (error.status === 412 || error.status === 428) setNotice('Este relato mudou. Atualize a página antes de continuar.')
        else if (error.status === 409) setNotice('Este relato não pode mais ser alterado.')
        else if (error.status === 401) setNotice('Sua sessão terminou. Entre novamente para enviar o relato.')
        else if (error.status === 413 || error.code === 'IMAGE_TOO_LARGE') setNotice('O envio excedeu o limite. Use até 5 fotos de 5 MiB cada ou um vídeo de 25 MiB, em até 26 MiB por requisição.')
        else if (error.code === 'IMAGE_STORAGE_UNAVAILABLE') setNotice('O serviço de fotos está indisponível. Seus dados foram mantidos; tente novamente mais tarde.')
        else if (error.status === 400) setNotice('Não foi possível enviar. Confira os campos e as fotos ou o vídeo antes de tentar novamente.')
        else setNotice(existing ? 'Não foi possível confirmar a edição. Consulte o relato novamente antes de tentar outra vez.' : 'O serviço não confirmou o registro. Seus dados foram mantidos. Tentar novamente pode criar um relato duplicado.')
      } else setNotice(existing ? 'Não foi possível confirmar a edição. Consulte o relato novamente antes de tentar outra vez.' : 'Não foi possível confirmar o registro. Confira sua conexão. Seus dados foram mantidos; reenviar pode criar um relato duplicado.')
      setErrors(mapped)
    } finally { submitting.current = false; setPending(false) }
  }

  if (registered) return <section className="max-w-reading py-8">
    <h1 tabIndex={-1} ref={node => node?.focus()}>Relato registrado</h1>
    <p className="text-lead">{registered.title}</p><OccurrenceStatus status="PENDING" />
    <div className="flex flex-wrap gap-3">
      <Link className={buttonStyles()} to={`/meus-relatos/${registered.id}`}>Ver relato</Link>
      <Link className={buttonStyles('secondary')} to="/meus-relatos">Meus relatos</Link>
      <Button variant="quiet" onClick={() => setRegistered(null)}>Relatar outro problema</Button>
    </div>
  </section>

  return <section className="py-8" aria-labelledby="report-title">
    <div className="max-w-reading">
      <p className="mb-2 text-small font-bold text-brand-default">Registro cidadão</p>
      <h1 id="report-title">{existing ? 'Editar relato' : 'Relatar problema'}</h1>
      <p className="text-lead text-text-secondary">Mostre o problema, marque o local e conte o essencial.</p>
      {notice && <Alert ref={feedback} tabIndex={-1} className="mt-6" tone={success ? 'success' : 'danger'} role={success ? 'status' : 'alert'}>{notice}</Alert>}
      <div className="mt-6">
        <form ref={form} aria-busy={pending} className="grid min-w-0 gap-5" onSubmit={event => { void submit(event) }} noValidate>
          <section aria-labelledby="photo-title" className={errors.image ? 'rounded-control border border-feedback-danger-foreground p-3' : ''}>
            <h2 id="photo-title" className="mb-2 text-title">1. Mostre o problema</h2><p className="text-small text-text-secondary">De uma a cinco fotos ou um vídeo.</p>
            <MediaPicker mode={mode} onMode={setMode} errorId={errors.image ? "report-photo-error" : undefined} value={photos} onChange={setPhotos} existing={existing} disabled={pending} onValidationChange={busy => {
              validatingImage.current = busy
              setImageBusy(busy)
            }} />
            {errors.image && <p id="report-photo-error" className="mt-2 text-small text-feedback-danger-foreground" role="alert">{errors.image}</p>}
          </section>
          <section aria-labelledby="location-title" className="grid min-w-0 gap-4 border-t border-border-subtle pt-6">
            <h2 id="location-title" className="mb-0 text-title">2. Onde fica?</h2>
          <LocationPicker value={location} onChange={setLocation} disabled={pending} error={errors.location} focusError={!errors.image} />
          <Input label="Bairro" value={neighborhood} error={errors.neighborhood} disabled={pending} onChange={event => setNeighborhood(event.target.value)} />
          <Input label="Ponto de referência" description="Informe rua, número, esquina ou outro detalhe que ajude a encontrar o local." value={reference} error={errors.reference} disabled={pending} onChange={event => setReference(event.target.value)} />
          </section>
          <section aria-labelledby="information-title" className="grid min-w-0 gap-4 border-t border-border-subtle pt-6">
            <h2 id="information-title" className="mb-0 text-title">3. Conte o essencial</h2>
          <Select label="Categoria" value={categoryId} error={errors.categoryId} disabled={loadingCategories || pending} onChange={event => setCategoryId(event.target.value)}>
            <option value="">Selecione uma categoria</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
          <Input label="Título" value={title} error={errors.title} disabled={pending} onChange={event => setTitle(event.target.value)} />
          <Textarea label="Detalhes (opcional)" description={`Se quiser, conte algo que as fotos ou o vídeo não mostram. ${Array.from(cleanOccurrenceText(description)).length}/1000`} value={description} error={errors.description} disabled={pending} onChange={event => setDescription(event.target.value)} />
          </section>
          {review?.key === criteriaKey && <SimilarOccurrencesReview key={criteriaKey} criteria={criteria} visible={review.visible}
            busy={pending || imageBusy} onReview={() => setReview({ key: criteriaKey, visible: false })} onConfirm={() => { void confirm() }} />}
          <Button type="submit" loading={pending} disabled={loadingCategories || imageBusy || pending}>{pending ? 'Enviando…' : existing ? 'Salvar relato' : 'Enviar relato'}</Button>
          {existing && (pending ? <Button variant="quiet" disabled>Cancelar edição</Button> : <Link className={buttonStyles('quiet')} to={`/meus-relatos/${existing.id}`} state={{ from }}>Cancelar edição</Link>)}
          {existing && notice && <Link to={`/meus-relatos/${existing.id}`}>Consultar relato novamente</Link>}
        </form>
      </div>
    </div>
  </section>
}
