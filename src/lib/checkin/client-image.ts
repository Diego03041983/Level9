const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

export async function compressCheckinImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo seleccionado no es una imagen");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Este navegador no puede procesar la fotografía");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("No se pudo comprimir la fotografía"))),
        "image/jpeg",
        JPEG_QUALITY,
      ),
    );
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "avatar"}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
