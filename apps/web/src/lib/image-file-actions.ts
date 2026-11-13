export async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
  return response.blob();
}

export async function copyImageBlobToClipboard(
  url: string,
  preferredMime = 'image/png',
): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('image clipboard is unavailable');
  }
  const blob = await fetchImageBlob(url);
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type || preferredMime]: blob }),
  ]);
}

export type ImageSaveResult = 'downloaded' | 'shared';
export type ImageCopyResult = 'copied' | 'shared';

function imageFile(blob: Blob, filename: string, preferredMime = 'image/png'): File {
  return new File([blob], filename, { type: blob.type || preferredMime });
}

export async function prepareImageFile(
  url: string,
  filename: string,
  preferredMime = 'image/png',
): Promise<File> {
  const blob = await fetchImageBlob(url);
  return imageFile(blob, filename, preferredMime);
}

export function canSharePreparedImageFile(file: File): boolean {
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function isMobileContainer(): boolean {
  return navigator.maxTouchPoints > 0
    && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function shareImageFile(file: File): Promise<void> {
  if (!canSharePreparedImageFile(file)) throw new Error('file sharing is unavailable');
  await navigator.share({ files: [file], title: file.name });
}

export async function sharePreparedImageFile(file: File): Promise<void> {
  await shareImageFile(file);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Saves an image using the system file sheet in mobile webviews, where the
 * download attribute is ignored. Desktop browsers keep their native download.
 */
export async function saveImageBlob(
  url: string,
  filename: string,
  preferredMime = 'image/png',
): Promise<ImageSaveResult> {
  const file = await prepareImageFile(url, filename, preferredMime);
  return savePreparedImageFile(file);
}

/**
 * Performs the user-triggered save with a file prepared before the click.
 * Mobile WebKit requires navigator.share() while transient activation is
 * still live, so this function must not perform network work first.
 */
export async function savePreparedImageFile(file: File): Promise<ImageSaveResult> {
  if (isMobileContainer() && canSharePreparedImageFile(file)) {
    await sharePreparedImageFile(file);
    return 'shared';
  }
  triggerBlobDownload(file, file.name);
  return 'downloaded';
}

/**
 * Copies the real image when the browser exposes image clipboard support.
 * Feishu/iOS webviews usually do not, so they receive the same image File in
 * the native sheet and can choose the system "Copy" action; links are never
 * substituted for image content.
 */
export async function copyOrShareImageBlob(
  url: string,
  filename: string,
  preferredMime = 'image/png',
): Promise<ImageCopyResult> {
  const file = await prepareImageFile(url, filename, preferredMime);
  return copyOrSharePreparedImageFile(file);
}

/** Uses the preview's prepared file so clipboard/share starts from the click. */
export async function copyOrSharePreparedImageFile(file: File): Promise<ImageCopyResult> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [file.type]: file }),
      ]);
      return 'copied';
    } catch {
      // Continue to the native file sheet without changing the payload to a URL.
    }
  }
  await sharePreparedImageFile(file);
  return 'shared';
}

export async function downloadImageBlob(url: string, filename: string): Promise<void> {
  const blob = await fetchImageBlob(url);
  triggerBlobDownload(blob, filename);
}
