export interface SaveCsvResult {
  uri: string;
  /** Mirrors the native contract; the browser download is always "shared". */
  shared: boolean;
}

/** Web export: trigger a Blob download — no native share sheet exists in browsers. */
export async function saveCsvFile(fileName: string, contents: string): Promise<SaveCsvResult> {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Give the browser a moment to start the download before invalidating the URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { uri: url, shared: true };
}
