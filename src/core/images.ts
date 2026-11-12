/** Starts loading an image; draw code checks `complete` before using it. */
export function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}
