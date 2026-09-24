// Downscale + re-encode large photos before upload. A truck-stop phone on a
// slow rural connection shouldn't push an 8 MB camera shot over the wire — the
// scanner only needs a legible image. PDFs pass through untouched (a canvas
// can't rasterize one) and so do already-small files.
//
// ponytail: native createImageBitmap + canvas, no image library. Add one only
// if EXIF-orientation handling becomes a real problem in the field.
const MAX_DIMENSION = 1600
const COMPRESS_ABOVE_BYTES = 1 << 20 // 1 MB
const JPEG_QUALITY = 0.8

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= COMPRESS_ABOVE_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    // Keep the original if re-encoding didn't actually shrink it.
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file // any decode failure → upload the original, let the server decide
  }
}
