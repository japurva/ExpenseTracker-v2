type TesseractModule = typeof import('tesseract.js');
type TesseractWorker = Awaited<ReturnType<TesseractModule['createWorker']>>;

/** Web falls back to tesseract.js (WASM); it is dynamically imported so native bundles skip it. */
export const OCR_ENGINE = 'tesseract' as const;

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const module = (await import('tesseract.js')) as TesseractModule & { default?: TesseractModule };
      const createWorker = module.createWorker ?? module.default?.createWorker;
      if (!createWorker) {
        throw new Error('tesseract.js did not expose createWorker().');
      }
      return createWorker('eng');
    })();
  }
  return workerPromise;
}

export async function recognizeText(imageUri: string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageUri);
  return data.text;
}

export async function disposeOcrEngine(): Promise<void> {
  if (!workerPromise) {
    return;
  }
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
