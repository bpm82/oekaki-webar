const query = new URLSearchParams(location.search);
const value = query.get('id') || query.get('model') || '';
export const slot = /^(?:0?[1-9]|[1-9]\d|100)$/.test(value) ? value.padStart(2, '0') : null;

export async function currentWork() {
  const response = await fetch('../catalog.json?t=' + Math.floor(Date.now() / 15000), {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('catalog');
  return (await response.json())[slot];
}
export function asset(name, version) {
  return '../assets/' + slot + '/' + name + (version ? '?v=' + encodeURIComponent(version) : '');
}
