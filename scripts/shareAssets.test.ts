import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARE_IMAGES, STORY_VIDEO } from '../shared/share.ts';

const media = (f: string) => join(import.meta.dirname, '..', 'public', 'media', f);

describe('share assets', () => {
  it('has a rendered file in public/media for every catalogue entry', () => {
    const files = [...SHARE_IMAGES.map((i) => i.file), STORY_VIDEO.mp4, STORY_VIDEO.webm, STORY_VIDEO.poster];
    expect(files.filter((f) => !existsSync(media(f)))).toEqual([]);
  });

  it('keeps assets light enough for link previews and mobile', () => {
    for (const i of SHARE_IMAGES) expect(statSync(media(i.file)).size, i.file).toBeLessThan(600_000);
    expect(statSync(media(STORY_VIDEO.mp4)).size).toBeLessThan(4_000_000);
  });
});
