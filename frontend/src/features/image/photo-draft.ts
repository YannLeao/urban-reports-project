export type PhotoDraft = { key: string; id: string; file?: never } | { key: string; file: File; id?: never }

export function appendPhotoDraft(body: FormData, items: PhotoDraft[], editing: boolean) {
  let uploadIndex = 0
  const manifest = items.map(item => {
    if (!item.file) return { id: item.id }
    body.append('images', item.file, item.file.name)
    return { uploadIndex: uploadIndex++ }
  })
  if (editing) body.append('media', new Blob([JSON.stringify({ items: manifest })], { type: 'application/json' }))
}
