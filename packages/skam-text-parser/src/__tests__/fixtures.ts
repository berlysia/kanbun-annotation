import { expect } from 'vitest';
import type { SKAMDocument } from '@kanbun-skam/skam';
import { parse } from '../index.js';
import type { NotationOptions } from '../options.js';

export const examples: readonly string[] = [
  '學（まな）びて而時に習ふ＜レ＞之を。不＜二＞亦た說（よろこ）ばしから＜一＞乎。',
  '過ぎたるは猶（な）ほ｛ごとし｝＜レ＞不ざるが＜レ＞及ば。',
  '｜所＜二＞ー以（ゆゑん）',
  '習ふ＜レ＞之＋を。',
  '學（まな）びて而時に習ふ＜レ＞之を。\n不＜二＞亦た說（よろこ）ばしから＜一＞乎。\n\n有り＜レ＞朋自り＜二＞遠方＜一＞來たる。',
];

export function document(source: string, options?: NotationOptions): SKAMDocument {
  const result = parse(source, options);
  expect(result.diagnostics).toEqual([]);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
}

export const featureNames = [
  'kaeri',
  'okurigana',
  'yomigana',
  'kutoten',
  'linebreak',
  'saidoku',
  'soegana',
  'tateten',
] as const;
