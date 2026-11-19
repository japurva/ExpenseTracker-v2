import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface SaveCsvResult {
  uri: string;
  /** False when the platform has no share sheet and the file was only written. */
  shared: boolean;
}

/**
 * Native export: write into the cache directory, then hand the file to the OS
 * share sheet (Files, Mail, Drive, …).
 */
export async function saveCsvFile(fileName: string, contents: string): Promise<SaveCsvResult> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true, intermediates: true });
  await file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export transactions',
    });
    return { uri: file.uri, shared: true };
  }

  return { uri: file.uri, shared: false };
}
