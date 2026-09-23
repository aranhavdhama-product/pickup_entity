// data: URLs cannot be opened as a top-level navigation, so hand the PDF viewer a blob instead
export function toBlobUrl(dataUrl: string) {
  const [meta, encoded] = dataUrl.split(',')
  const mime = meta.slice(5).replace(';base64', '')
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}
