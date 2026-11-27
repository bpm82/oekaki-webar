const receiptKey = 'oekaki-webar:submitted-card';
const drawingKey = 'oekaki-webar:game-drawing';

export function readReceipt() {
  try {
    return sessionStorage.getItem(receiptKey);
  } catch {
    return null;
  }
}

export function saveReceipt(card, templateName, canvas) {
  try {
    sessionStorage.removeItem(drawingKey);
    sessionStorage.setItem(receiptKey, card);
    if (templateName && canvas) {
      const preview = document.createElement('canvas');
      preview.width = preview.height = 160;
      const context = preview.getContext('2d');
      context.drawImage(canvas, 0, 0, 160, 160);
      // Trim the transparent margins so the child's marks are legible on a small ornament.
      const pixels = context.getImageData(0, 0, 160, 160).data;
      let left = 160, top = 160, right = -1, bottom = -1;
      for (let y = 0; y < 160; y++) {
        for (let x = 0; x < 160; x++) {
          if (!pixels[(y * 160 + x) * 4 + 3]) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) return;
      const cropped = document.createElement('canvas');
      cropped.width = right - left + 1;
      cropped.height = bottom - top + 1;
      cropped.getContext('2d').drawImage(preview, -left, -top);
      sessionStorage.setItem(drawingKey, JSON.stringify({ card, name: templateName, image: cropped.toDataURL() }));
    }
  } catch {
    // The current page can still show the receipt when storage is blocked.
  }
}

export function readGameDrawing(card) {
  try {
    const drawing = JSON.parse(sessionStorage.getItem(drawingKey));
    if (drawing?.card === card && card === readReceipt() && drawing.image?.startsWith('data:image/png;base64,'))
      return drawing;
  } catch {
    // Cards submitted before game artwork was introduced have no preview.
  }
  return null;
}

export function clearReceipt() {
  try {
    sessionStorage.removeItem(receiptKey);
    sessionStorage.removeItem(drawingKey);
  } catch {
    // There is no accessible receipt to clear when storage is blocked.
  }
}
