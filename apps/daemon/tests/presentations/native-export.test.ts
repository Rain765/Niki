import { expect, it } from 'vitest';
import JSZip from 'jszip';
import sharp from 'sharp';
import { exportNativeSlides } from '../../src/presentations/native-export.js';
import type { NativePresentationInspection } from '@open-design/contracts';

it.each([{width:1280,height:720},{width:960,height:1280}])('preserves every rendered page and its $width × $height canvas in image PPTX', async viewport => {
  const image = await sharp({create:{width:viewport.width,height:viewport.height,channels:3,background:'white'}}).png().toBuffer();
  const report = {viewport,slides:[{page:1},{page:2}]} as NativePresentationInspection;
  const bytes = await exportNativeSlides({format:'pptx',report,images:[image,image]});
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(2);
  const xml = await zip.file('ppt/presentation.xml')!.async('text');
  expect(xml).toContain(`cx="${viewport.width*9525}" cy="${viewport.height*9525}"`);
  expect(await zip.file('ppt/slides/slide1.xml')!.async('text')).toContain('<p:pic>');
  await expect(exportNativeSlides({format:'pptx',report,images:[image]})).rejects.toThrow('Missing rendered slides');
});
