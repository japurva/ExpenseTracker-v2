import TextRecognition from '@react-native-ml-kit/text-recognition';

/** Mobile OCR runs on-device through ML Kit; requires a development build. */
export const OCR_ENGINE = 'mlkit' as const;

export async function recognizeText(imageUri: string): Promise<string> {
  const result = await TextRecognition.recognize(imageUri);
  return result.text;
}

export async function disposeOcrEngine(): Promise<void> {
  // ML Kit holds no long-lived worker.
}
