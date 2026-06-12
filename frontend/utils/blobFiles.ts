export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read the file data.'));
    };

    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];

      if (!base64) {
        reject(new Error('Failed to encode the file data.'));
        return;
      }

      resolve(base64);
    };

    reader.readAsDataURL(blob);
  });

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const withTemporaryObjectUrl = async <T,>(
  blob: Blob,
  callback: (url: string) => Promise<T> | T
): Promise<T> => {
  const url = URL.createObjectURL(blob);

  try {
    return await callback(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};
