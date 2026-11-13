import { describe, expect, it } from 'vitest';

import { normalizeLoanVideoStoryboard } from '../src/loan-video.js';

describe('loan video storyboard normalization', () => {
  it('preserves the fixed background and full/device presentation roles', () => {
    const storyboard = normalizeLoanVideoStoryboard({
      version: 2,
      title: 'Structured tutorial',
      product: 'zamloan',
      language: 'zh-CN',
      aspectRatio: '3:4',
      durationSeconds: 30,
      narration: false,
      subtitles: false,
      backgroundRef: '.od-inputs/background.png',
      scenes: [
        {
          id: 'intro',
          assetRef: '.od-inputs/intro.png',
          presentation: 'full',
          text: '',
          captionEnabled: false,
          voiceoverEnabled: false,
        },
        {
          id: 'step-1',
          assetRef: '.od-inputs/page.png',
          presentation: 'device',
          text: '',
          captionEnabled: false,
          voiceoverEnabled: false,
          interaction: {
            type: 'otp',
            start: 0.66,
            duration: 1.12,
            text: '2479',
            target: { x: 0.09, y: 0.27, width: 0.83, height: 0.073 },
          },
        },
        {
          id: 'outro',
          assetRef: '.od-inputs/outro.png',
          presentation: 'full',
          text: '',
          captionEnabled: false,
          voiceoverEnabled: false,
        },
      ],
      transitions: [
        { fromSceneId: 'intro', toSceneId: 'step-1', action: { type: 'auto' } },
        {
          fromSceneId: 'step-1',
          toSceneId: 'outro',
          action: {
            type: 'open-modal',
            x: 0.5,
            y: 0.75,
            width: 0.2,
            height: 0.08,
            clipTop: 0.106,
          },
        },
      ],
    });

    expect(storyboard.backgroundRef).toBe('.od-inputs/background.png');
    expect(storyboard.scenes.map((scene) => scene.presentation))
      .toEqual(['full', 'device', 'full']);
    expect(storyboard.scenes[1]?.interaction).toEqual({
      type: 'otp',
      start: 0.66,
      duration: 1.12,
      text: '2479',
      target: { x: 0.09, y: 0.27, width: 0.83, height: 0.073 },
    });
    expect(storyboard.transitions[1]?.action).toEqual({
      type: 'open-modal',
      x: 0.5,
      y: 0.75,
      width: 0.2,
      height: 0.08,
      clipTop: 0.106,
    });
  });

  it('accepts numeric keypad interactions for phone-number entry', () => {
    const storyboard = normalizeLoanVideoStoryboard({
      version: 2,
      title: 'Phone sign in',
      product: 'zamloan',
      language: 'en',
      aspectRatio: '3:4',
      durationSeconds: 15,
      narration: false,
      subtitles: false,
      scenes: [{
        id: 'phone',
        assetRef: '.od-inputs/phone.png',
        presentation: 'device',
        text: '',
        captionEnabled: false,
        voiceoverEnabled: false,
        interaction: {
          type: 'keypad',
          start: 0.5,
          duration: 3.6,
          text: '971234567',
          target: { x: 0.2, y: 0.24, width: 0.5, height: 0.06 },
        },
      }],
      transitions: [],
    });

    expect(storyboard.scenes[0]?.interaction).toMatchObject({
      type: 'keypad',
      text: '971234567',
    });
  });
});
