"use client";
import { JPEG_QUALITY, MAX_IMAGE_EDGE, shouldCompress, targetDimensions } from "./image-compression";

/**
 * Re-encodes an image in the browser before it is uploaded.
 *
 * Every step degrades safely: an unsupported format, a browser without
 * `createImageBitmap`, a decode failure, or a result that somehow comes out
 * larger all fall back to sending the original file untouched. A receipt that
 * uploads at full size is a minor cost; a receipt that fails to upload is a
 * lost record.
 */
export async function compressImage(file: File): Promise<{ file: File; originalSize: number }> {
  const originalSize = file.size;
  if (!shouldCompress(file) || typeof createImageBitmap !== "function") {
    return { file, originalSize };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetDimensions(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
    if (width === 0 || height === 0) {
      bitmap.close?.();
      return { file, originalSize };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return { file, originalSize };
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    // If re-encoding gained nothing, keep the original.
    if (!blob || blob.size >= originalSize) return { file, originalSize };

    const renamed = `${file.name.replace(/\.(png|webp|jpe?g)$/i, "")}.jpg`;
    return {
      file: new File([blob], renamed, { type: "image/jpeg", lastModified: file.lastModified }),
      originalSize,
    };
  } catch {
    return { file, originalSize };
  }
}
