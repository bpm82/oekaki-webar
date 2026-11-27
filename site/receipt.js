const receiptKey = 'oekaki-webar:submitted-card';

export function readReceipt() {
  try {
    return sessionStorage.getItem(receiptKey);
  } catch {
    return null;
  }
}

export function saveReceipt(card) {
  try {
    sessionStorage.setItem(receiptKey, card);
  } catch {
    // The current page can still show the receipt when storage is blocked.
  }
}

export function clearReceipt() {
  sessionStorage.removeItem(receiptKey);
}
