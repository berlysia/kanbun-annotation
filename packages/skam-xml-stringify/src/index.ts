/**
 * SKAM JSON to SKAM-ML/XML Stringifier
 *
 * SKAMドキュメントのXML形式シリアライズ
 */

export { SKAM_ML_CONTENT_MODEL, SKAM_ML_NESTING_ORDER } from '@kanbun-skam/skam';
export { stringify, type StringifyOptions } from './stringify.js';
export { SKAMXMLStringifyError, type StringifyLoss, type StringifyLossCode } from './losses.js';
