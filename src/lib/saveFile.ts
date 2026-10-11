import { Capacitor } from '@capacitor/core';

const b64 = (data: Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export type SaveResult = 'shared' | 'downloaded';

/**
 * Hand a file to the user. In the Android app that opens the system share sheet (save to Files/Drive, send by
 * email or message); on the web it downloads. The file is built on this device and never uploaded by Wakeful.
 */
export async function saveFile(name: string, data: Uint8Array | string, mime: string, title = name): Promise<SaveResult> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({ path: name, data: b64(data), directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    try { await Share.share({ title, url: uri, dialogTitle: title }); }
    finally { setTimeout(() => { Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => {}); }, 120_000); }
    return 'shared';
  }
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}
