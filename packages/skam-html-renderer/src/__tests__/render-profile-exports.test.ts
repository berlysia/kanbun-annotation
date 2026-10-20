import { describe, it, expect } from 'vitest';
import {
  RENDER_PROFILE_KEYS as skamKeys,
  SKAMRenderProfileError as SkamError,
} from '@kanbun-skam/skam/rendering';
import type { SKAMDocument } from '@kanbun-skam/skam';
import {
  RENDER_PROFILE_KEYS,
  SKAMRenderProfileError,
  render,
  type RenderProfileErrorKind,
  type RenderProfileKey,
} from '../index.js';

const doc: SKAMDocument = {
  format: 'skam@0.1',
  tokens: [{ id: 't1', text: '甲' }],
  blocks: [{ id: 'b1', tokenIds: ['t1'] }],
  marks: [],
  readings: [],
};

describe('render profile re-exports', () => {
  it('are the same values as skam/rendering', () => {
    expect(SKAMRenderProfileError).toBe(SkamError);
    expect(RENDER_PROFILE_KEYS).toBe(skamKeys);
  });

  it('exposes the key and kind types', () => {
    const key: RenderProfileKey = RENDER_PROFILE_KEYS[0]!;
    const kind: RenderProfileErrorKind = 'UNKNOWN_KEY';
    expect([key, kind]).toHaveLength(2);
  });

  it('render() throws SKAMRenderProfileError for a misspelled key', () => {
    try {
      render(doc, { profile: { okurigna: false } as never });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SKAMRenderProfileError);
      expect(error).toMatchObject({ kind: 'UNKNOWN_KEY', key: 'okurigna', where: 'profile' });
    }
  });
});
