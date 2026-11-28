importScripts('../vendor/zxing-reader.js');

ZXingWASM.prepareZXingModule({
  overrides: { locateFile: (name) => new URL('../vendor/' + name, self.location.href).href },
});

self.onmessage = async ({ data: frame }) => {
  try {
    const results = await ZXingWASM.readBarcodes(frame, {
      formats: ['QRCode'],
      maxNumberOfSymbols: 0,
      tryInvert: false,
    });
    self.postMessage({ cards: results.map(({ text, position }) => ({ text, position })) });
  } catch {
    self.postMessage({ error: true });
  }
};
