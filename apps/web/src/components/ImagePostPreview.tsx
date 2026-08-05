import { useEffect } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';

interface Props {
  imageUrl: string;
  imageAlt: string;
  fileName: string;
  onClose: () => void;
}

/**
 * Read-only social-feed mock used to show how a generated image may look
 * after it is posted. It deliberately owns no publishing or platform API
 * behavior; the image URL is the only product data passed into the mock.
 */
export function ImagePostPreview({ imageUrl, imageAlt, fileName, onClose }: Props) {
  const t = useT();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="image-post-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('common.preview')} ${fileName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="image-post-preview__card">
        <header className="image-post-preview__header">
          <span>{t('common.preview')}</span>
          <button
            type="button"
            className="icon-only"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="image-post-preview__stage">
          <div className="image-post-preview__feed" data-testid="image-post-preview-feed">
            <div className="image-post-preview__app-bar" aria-hidden="true">
              <Icon name="menu" size={21} />
              <span className="image-post-preview__wordmark">facebook</span>
              <span className="image-post-preview__app-actions">
                <Icon name="search" size={19} />
                <Icon name="bell" size={19} />
              </span>
            </div>

            <article className="image-post-preview__post">
              <header className="image-post-preview__post-header">
                <span className="image-post-preview__avatar" aria-hidden="true">N</span>
                <span className="image-post-preview__author">
                  <strong>Niki</strong>
                  <small>{t('common.justNow')} · Public</small>
                </span>
                <Icon name="more-horizontal" size={20} />
              </header>
              <p className="image-post-preview__caption">{fileName}</p>
              <div className="image-post-preview__media">
                <img src={imageUrl} alt={imageAlt} draggable={false} />
              </div>
              <div className="image-post-preview__engagement" aria-hidden="true">
                <span><Icon name="thumbs-up" size={17} /></span>
                <span><Icon name="comment" size={17} /></span>
                <span><Icon name="share" size={17} /></span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
