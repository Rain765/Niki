// Image / video preview surface for the plugins-home gallery.
//
// Renders the plugin's poster as the card's hero. When the manifest
// declares an `od.preview.video` URL we mount a `<video>` element on
// hover so users can scrub the looping clip without leaving the
// home view. Until then the poster image is the only thing the
// browser fetches — keeps a 50-tile gallery cheap.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MediaPreviewSpec } from '../preview';
import { Icon } from '../../Icon';

interface Props {
  preview: MediaPreviewSpec;
  pluginTitle: string;
  inView: boolean;
}

export function MediaSurface({ preview, pluginTitle, inView }: Props) {
  const [hovering, setHovering] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const localPreview = buildLocalPreview(pluginTitle);
  const showVideo =
    inView && hovering && preview.mediaType === 'video' && Boolean(preview.videoUrl);

  useEffect(() => {
    setPosterFailed(false);
    setPosterLoaded(false);
  }, [preview.poster]);

  useEffect(() => {
    if (!inView || !preview.poster || posterLoaded || posterFailed) return;
    const timeout = window.setTimeout(() => {
      setPosterFailed(true);
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [inView, posterFailed, posterLoaded, preview.poster]);

  return (
    <div
      className="plugins-home__media"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {inView && preview.poster && !posterFailed ? (
        <img
          className="plugins-home__media-img"
          src={preview.poster}
          alt={`${pluginTitle} preview`}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setPosterLoaded(true)}
          onError={() => setPosterFailed(true)}
        />
      ) : inView && preview.poster && posterFailed ? (
        <div
          className={`plugins-home__media-fallback plugins-home__media-fallback--${localPreview.motif}`}
          style={localPreview.style}
          aria-label={`${pluginTitle} local preview`}
        >
          <div className="plugins-home__media-fallback-art" aria-hidden>
            <span className="plugins-home__media-fallback-shape plugins-home__media-fallback-shape--one" />
            <span className="plugins-home__media-fallback-shape plugins-home__media-fallback-shape--two" />
            <span className="plugins-home__media-fallback-shape plugins-home__media-fallback-shape--three" />
          </div>
          <span className="plugins-home__media-fallback-title">{pluginTitle}</span>
        </div>
      ) : (
        <div className="plugins-home__media-skeleton" aria-hidden />
      )}
      {showVideo ? (
        <video
          className="plugins-home__media-video"
          src={preview.videoUrl ?? undefined}
          autoPlay
          muted
          playsInline
          loop
          preload="none"
        />
      ) : null}
      {preview.mediaType === 'video' && !preview.imageOnly ? (
        <span className="plugins-home__media-badge" aria-hidden>
          <Icon name="play" size={12} />
        </span>
      ) : null}
    </div>
  );
}

type LocalPreviewMotif =
  | 'anime'
  | 'commerce'
  | 'game'
  | 'infographic'
  | 'map'
  | 'portrait'
  | 'storyboard'
  | 'generic';

interface LocalPreview {
  motif: LocalPreviewMotif;
  style: CSSProperties;
}

function buildLocalPreview(title: string): LocalPreview {
  const seed = hashString(title);
  const hue = seed % 360;
  const motif = localPreviewMotif(title);
  return {
    motif,
    style: {
      '--poster-a': `hsl(${hue}, 72%, 52%)`,
      '--poster-b': `hsl(${(hue + 48) % 360}, 76%, 44%)`,
      '--poster-c': `hsl(${(hue + 186) % 360}, 62%, 24%)`,
    } as CSSProperties,
  };
}

function localPreviewMotif(title: string): LocalPreviewMotif {
  const text = title.toLowerCase();
  if (text.includes('anime') || text.includes('martial') || text.includes('battle')) return 'anime';
  if (text.includes('commerce') || text.includes('live stream') || text.includes('ui')) return 'commerce';
  if (text.includes('game') || text.includes('screenshot')) return 'game';
  if (text.includes('infographic') || text.includes('evolution') || text.includes('staircase')) return 'infographic';
  if (text.includes('map') || text.includes('city')) return 'map';
  if (text.includes('avatar') || text.includes('portrait') || text.includes('selfie')) return 'portrait';
  if (text.includes('storyboard') || text.includes('social')) return 'storyboard';
  return 'generic';
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
