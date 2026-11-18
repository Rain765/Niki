import { useState, type CSSProperties } from 'react';
import { projectFileDownloadUrl, projectFileUrl } from '../../providers/registry';
import { IconButton } from '../Button';
import { Icon } from '../Icon';
import { ResultHeader } from '../NikiResultControls';
import type { LoanVideoAspectRatio } from './types';
import type { SavedLoanVideo } from './useLoanVideoGeneration';

export function videoAspectNumber(aspect: LoanVideoAspectRatio): number {
  const [width, height] = aspect.split(':').map(Number);
  return width! / height!;
}

export function LoanVideoResult({
  video, expectedAspect, latest, downloadLabel, deleteLabel, deleting, canDelete, onDelete,
}: {
  video: SavedLoanVideo;
  expectedAspect?: LoanVideoAspectRatio;
  latest: boolean;
  downloadLabel: string;
  deleteLabel: string;
  deleting: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { projectId, file } = video;
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const aspect = dimensions ? dimensions.width / dimensions.height : videoAspectNumber(expectedAspect ?? '9:16');
  const details = dimensions ? `${dimensions.width} × ${dimensions.height} · MP4`
    : expectedAspect ? `${expectedAspect} · MP4` : 'MP4';
  return (
    <>
      <ResultHeader title={file.name} details={details} actions={<>
        <a className="od-button od-button--ghost od-button--compact od-icon-button"
          aria-label={downloadLabel} title={downloadLabel} href={projectFileDownloadUrl(projectId, file.name)} download>
          <Icon name="download" size={18} />
        </a>
        <IconButton label={deleteLabel} disabled={!canDelete} onClick={onDelete}>
          <Icon name={deleting ? 'spinner' : 'trash'} size={18} />
        </IconButton>
      </>} />
      <div className="niki-video-stage" style={{ '--niki-video-aspect': aspect } as CSSProperties}>
        <video data-testid={latest ? 'poster-app-video-result' : undefined} src={projectFileUrl(projectId, file.name)}
          aria-label={file.name} controls playsInline preload="metadata" onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth && videoHeight) setDimensions({ width: videoWidth, height: videoHeight });
          }} />
      </div>
    </>
  );
}
