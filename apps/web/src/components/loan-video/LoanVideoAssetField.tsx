import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useT } from '../../i18n';
import { Icon } from '../Icon';

interface Props {
  file: File | null;
  hint: string;
  label: string;
  onChange: (file: File | null) => void;
  testId: string;
}

export function LoanVideoAssetField({ file, hint, label, onChange, testId }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useObjectUrl(file);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.files?.[0] ?? null);
    event.target.value = '';
  };

  return (
    <article className={`loan-video-role${file ? ' is-complete' : ''}`}>
      <div className="loan-video-role__copy">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <button
        type="button"
        className="loan-video-role__picker"
        data-testid={`${testId}-surface`}
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? <img src={previewUrl} alt={file?.name ?? label} /> : <Icon name="image" size={22} />}
        <span>{file?.name ?? label}</span>
        <small>{file ? t('loanVideo.replaceScreenshot') : t('loanVideo.uploadScreenshot')}</small>
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*"
        data-testid={testId}
        onChange={selectFile}
      />
    </article>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}
