export function cardNumber(query) {
  const value = query.get('id') || query.get('model') || '';
  return /^(?:0?[1-9]|[1-9]\d|100)$/.test(value) ? value.padStart(2, '0') : null;
}
export const slot = cardNumber(new URLSearchParams(location.search));

export async function workCatalog() {
  const response = await fetch('../catalog.json?t=' + Math.floor(Date.now() / 15000), {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('catalog');
  return response.json();
}
export async function currentWork() {
  return (await workCatalog())[slot];
}
export function asset(name, version, number = slot) {
  return '../assets/' + number + '/' + name + (version ? '?v=' + encodeURIComponent(version) : '');
}
