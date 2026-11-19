import { useCameraPermissions, type CameraView, type PermissionResponse } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Platform } from 'react-native';

import { disposeOcrEngine, OCR_ENGINE, recognizeText } from '@/services/ocr/recognize';
import { parseReceiptText, type ParsedReceipt } from '@/utils/receiptParser';

export type ReceiptOcrStatus = 'idle' | 'capturing' | 'processing' | 'success' | 'error';

export interface UseReceiptOCROptions {
  /**
   * Ref to a mounted `<CameraView />`. When provided, capture goes through
   * expo-camera (in-app preview); otherwise the system camera UI is used.
   */
  cameraRef?: RefObject<CameraView | null>;
  onParsed?: (parsed: ParsedReceipt) => void;
  onError?: (message: string) => void;
}

export interface UseReceiptOCRResult {
  status: ReceiptOcrStatus;
  error: string | null;
  imageUri: string | null;
  parsed: ParsedReceipt | null;
  isBusy: boolean;
  engine: typeof OCR_ENGINE;
  cameraPermission: PermissionResponse | null;
  requestCameraPermission: () => Promise<PermissionResponse>;
  /** Runs OCR + parsing on an already captured image. */
  processImage: (uri: string) => Promise<ParsedReceipt | null>;
  captureWithCamera: () => Promise<ParsedReceipt | null>;
  pickFromLibrary: () => Promise<ParsedReceipt | null>;
  reset: () => void;
  /** Releases the web tesseract worker; safe to call on unmount. */
  dispose: () => void;
}

const OCR_TIMEOUT_MS = 30_000;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function useReceiptOCR(options: UseReceiptOCROptions = {}): UseReceiptOCRResult {
  const { cameraRef, onParsed, onError } = options;

  const [status, setStatus] = useState<ReceiptOcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fail = useCallback(
    (message: string) => {
      if (isMounted.current) {
        setError(message);
        setStatus('error');
      }
      onError?.(message);
    },
    [onError],
  );

  const processImage = useCallback(
    async (uri: string): Promise<ParsedReceipt | null> => {
      if (isMounted.current) {
        setStatus('processing');
        setError(null);
        setImageUri(uri);
      }

      try {
        const text = await Promise.race([
          recognizeText(uri),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Text recognition timed out.')), OCR_TIMEOUT_MS),
          ),
        ]);
        const result = parseReceiptText(text);
        if (isMounted.current) {
          setParsed(result);
          setStatus('success');
        }
        onParsed?.(result);
        return result;
      } catch (cause) {
        fail(errorMessage(cause, 'Text recognition failed.'));
        return null;
      }
    },
    [fail, onParsed],
  );

  const handlePickedAsset = useCallback(
    async (result: ImagePicker.ImagePickerResult): Promise<ParsedReceipt | null> => {
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) {
        if (isMounted.current) {
          setStatus('idle');
        }
        return null;
      }
      return processImage(uri);
    },
    [processImage],
  );

  const pickFromLibrary = useCallback(async (): Promise<ParsedReceipt | null> => {
    if (isMounted.current) {
      setStatus('capturing');
      setError(null);
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        fail('Photo library permission was denied.');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: false,
      });
      return await handlePickedAsset(result);
    } catch (cause) {
      fail(errorMessage(cause, 'Could not open the photo library.'));
      return null;
    }
  }, [fail, handlePickedAsset]);

  const captureWithCamera = useCallback(async (): Promise<ParsedReceipt | null> => {
    // Browsers have no camera sheet; the file picker is the only capture path
    // (mobile browsers still offer "take photo" in that UI).
    if (Platform.OS === 'web') {
      return pickFromLibrary();
    }

    // expo-camera permission also gates the in-app <CameraView /> preview.
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      fail('Camera permission was denied.');
      return null;
    }

    if (isMounted.current) {
      setStatus('capturing');
      setError(null);
    }

    try {
      const camera = cameraRef?.current;
      if (camera) {
        const photo = await camera.takePictureAsync({ quality: 0.9 });
        if (!photo?.uri) {
          throw new Error('The camera did not return an image.');
        }
        return await processImage(photo.uri);
      }

      // No in-app preview mounted: hand off to the platform camera UI.
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      return await handlePickedAsset(result);
    } catch (cause) {
      fail(errorMessage(cause, 'Could not capture the receipt.'));
      return null;
    }
  }, [cameraPermission, cameraRef, fail, handlePickedAsset, pickFromLibrary, processImage, requestCameraPermission]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setImageUri(null);
    setParsed(null);
  }, []);

  const dispose = useCallback(() => {
    void disposeOcrEngine();
  }, []);

  return {
    status,
    error,
    imageUri,
    parsed,
    isBusy: status === 'capturing' || status === 'processing',
    engine: OCR_ENGINE,
    cameraPermission,
    requestCameraPermission,
    processImage,
    captureWithCamera,
    pickFromLibrary,
    reset,
    dispose,
  };
}
