export interface ImageBox { x: number; y: number; width: number; height: number }

export function selectionBox(startX: number, startY: number, endX: number, endY: number): ImageBox | null {
  const x = Math.max(0, Math.min(1, Math.min(startX, endX)));
  const y = Math.max(0, Math.min(1, Math.min(startY, endY)));
  const right = Math.max(0, Math.min(1, Math.max(startX, endX)));
  const bottom = Math.max(0, Math.min(1, Math.max(startY, endY)));
  if (right - x < 0.02 || bottom - y < 0.02) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function imageCropPixels(box: ImageBox, imageWidth: number, imageHeight: number) {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth < 1 || imageHeight < 1) return null;
  const x = Math.max(0, Math.min(imageWidth - 1, Math.floor(box.x * imageWidth)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.floor(box.y * imageHeight)));
  return {
    x, y,
    width: Math.max(1, Math.min(imageWidth - x, Math.ceil(box.width * imageWidth))),
    height: Math.max(1, Math.min(imageHeight - y, Math.ceil(box.height * imageHeight))),
  };
}
