import { useState, useCallback } from 'react';
import { PhotoAsset, ScanResult, scanPhotos } from '../services/mediaScanner';

export const usePhotoScanner = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const startScan = useCallback(async () => {
    setIsScanning(true);
    setProgress(0);

    try {
      const result = await scanPhotos((info) => {
        setProgress(info.progress / 100);
      });
      setScanResult(result);
    } catch (e) {
      console.error('Error in usePhotoScanner:', e);
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    isScanning,
    progress,
    scanResult,
    startScan,
  };
};
