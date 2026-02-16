import { describe, it, expect } from 'vitest';
import type { SKAMDocument } from '../index.js';

describe('SKAM Examples', () => {
  describe('基本例: 學而時習之', () => {
    it('should be valid SKAMDocument', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '学' },
          { id: 't2', text: '而' },
          { id: 't3', text: '時' },
          { id: 't4', text: '習' },
          { id: 't5', text: '之' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
        marks: [
          { type: 'yomigana', id: 'm1', anchor: { from: 't1', to: 't1' }, value: 'まな' },
          { type: 'okurigana', id: 'm2', anchor: { from: 't1', to: 't1' }, value: 'びて' },
          { type: 'okurigana', id: 'm3', anchor: { from: 't3', to: 't3' }, value: 'に' },
          { type: 'soegana', id: 'm4', anchor: { from: 't5', to: 't5' }, value: 'を' },
          { type: 'okurigana', id: 'm5', anchor: { from: 't4', to: 't4' }, value: 'ふ' },
          { type: 'kaeri', id: 'm6', position: { blockId: 'b1', after: 't5' }, value: '㆑' },
        ],
        readings: [{ kind: 'kakikudashi', text: '学びて時に之を習ふ' }],
      };

      expect(doc.format).toBe('skam@0.1');
      expect(doc.tokens).toHaveLength(5);
      expect(doc.marks).toHaveLength(6);
    });
  });

  describe('再読文字: 將死', () => {
    it('should support saidoku mark type', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '將' },
          { id: 't2', text: '死' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2'] }],
        marks: [
          {
            type: 'saidoku',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            forms: [
              { n: 1, yomi: 'まさ', okuri: 'に' },
              { n: 2, okuri: 'す' },
            ],
          },
          { type: 'yomigana', id: 'm2', anchor: { from: 't2', to: 't2' }, value: 'し' },
          { type: 'okurigana', id: 'm3', anchor: { from: 't2', to: 't2' }, value: 'なんと' },
        ],
        derivations: [{ kind: 'readingOrder', method: 'manual', result: ['t1', 't2', 't1'] }],
        readings: [{ kind: 'kakikudashi', text: 'まさに死なんとす' }],
      };

      const firstMark = doc.marks[0]!;
      expect(firstMark.type).toBe('saidoku');
      if (firstMark.type === 'saidoku') {
        expect(firstMark.forms).toHaveLength(2);
      }
    });
  });

  describe('ヲコト点', () => {
    it('should support okototen with glyph-grid coordinates', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '國' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'okototen',
            id: 'm1',
            anchor: { from: 't1', to: 't1' },
            position: { system: 'glyph-grid', grid: '5x5', x: 4, y: 4 },
            shape: 'dot',
            sound: 'り',
          },
        ],
        readings: [],
      };

      const firstMark = doc.marks[0]!;
      expect(firstMark.type).toBe('okototen');
      if (firstMark.type === 'okototen') {
        expect(firstMark.position.system).toBe('glyph-grid');
        expect(firstMark.position.grid).toBe('5x5');
      }
    });
  });

  describe('句読点', () => {
    it('should support kutoten mark type with position', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [{ id: 't1', text: '學' }],
        blocks: [{ id: 'b1', tokenIds: ['t1'] }],
        marks: [
          {
            type: 'kutoten',
            id: 'm1',
            position: { blockId: 'b1', after: 't1' },
            value: '。',
            kind: 'ku',
          },
        ],
        readings: [],
      };

      const firstMark = doc.marks[0]!;
      expect(firstMark.type).toBe('kutoten');
      if (firstMark.type === 'kutoten') {
        expect(firstMark.kind).toBe('ku');
        expect(firstMark.position).toEqual({ blockId: 'b1', after: 't1' });
      }
    });
  });

  describe('たて点: 國家', () => {
    it('should support tateten mark type for compound words', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '國' },
          { id: 't2', text: '家' },
          { id: 't3', text: '之' },
          { id: 't4', text: '大' },
          { id: 't5', text: '事' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4', 't5'] }],
        marks: [
          { type: 'tateten', id: 'm1', anchor: { from: 't1', to: 't2' } },
          { type: 'tateten', id: 'm2', anchor: { from: 't4', to: 't5' } },
          { type: 'yomigana', id: 'm3', anchor: { from: 't1', to: 't2' }, value: 'こっか' },
        ],
        readings: [{ kind: 'kakikudashi', text: '国家の大事' }],
      };

      expect(doc.marks).toHaveLength(3);
      const tatetenMark = doc.marks[0]!;
      expect(tatetenMark.type).toBe('tateten');
      if (tatetenMark.type === 'tateten') {
        expect(tatetenMark.anchor).toEqual({ from: 't1', to: 't2' });
      }
    });
  });

  describe('読み順計算: 不可不學', () => {
    it('should support complex kaeriten with derivations', () => {
      const doc: SKAMDocument = {
        format: 'skam@0.1',
        tokens: [
          { id: 't1', text: '不' },
          { id: 't2', text: '可' },
          { id: 't3', text: '不' },
          { id: 't4', text: '學' },
        ],
        blocks: [{ id: 'b1', tokenIds: ['t1', 't2', 't3', 't4'] }],
        marks: [
          { type: 'kaeri', id: 'm1', position: { blockId: 'b1', after: 't2' }, value: '㆓' },
          { type: 'kaeri', id: 'm2', position: { blockId: 'b1', after: 't4' }, value: '㆒㆑' },
        ],
        derivations: [
          { kind: 'readingOrder', method: 'kaeriten-stack', result: ['t4', 't3', 't2', 't1'] },
        ],
        readings: [{ kind: 'kakikudashi', text: '学ばざるべからず' }],
      };

      expect(doc.derivations).toBeDefined();
      const firstDerivation = doc.derivations![0]!;
      expect(firstDerivation.result).toEqual(['t4', 't3', 't2', 't1']);
    });
  });
});
