/**
 * SKAM-ML/XML
 *
 * SKAMドキュメントのXML形式シリアライズ/デシリアライズ
 */

export type { SKAMDocument } from '@kanbun/skam';

export { parse, SKAMXMLParseError, type ParseOptions } from './parser.js';

// TODO: stringify function for SKAM JSON → XML serialization
