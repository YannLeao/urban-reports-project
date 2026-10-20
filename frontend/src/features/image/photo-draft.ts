export type PhotoDraft = { key: string; id: string; file?: never } | { key: string; file: File; id?: never }

export function appendPhotoDraft(body: FormData, items: PhotoDraft[], editing: boolean, mode: 'IMAGE' | 'VIDEO' = 'IMAGE') {
  let uploadIndex = 0
  const manifest = items.map(item => {
    if (!item.file) return { id: item.id }
    body.append(mode === 'VIDEO' ? 'video' : 'images', item.file, mode === 'VIDEO' ? 'upload.mp4' : item.file.name)
    return { uploadIndex: uploadIndex++ }
  })
  if (editing) body.append('media', new Blob([JSON.stringify({ items: manifest })], { type: 'application/json' }))
}
