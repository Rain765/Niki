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

export async function downloadImageBlob(url: string, filename: string): Promise<void> {
  const blob = await fetchImageBlob(url);
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
