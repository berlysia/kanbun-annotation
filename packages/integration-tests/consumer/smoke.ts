import type { SKAMDocument } from '@kanbun-skam/skam';
import { buildAnnotationIR } from '@kanbun-skam/skam/rendering';
import {
  defaultExtensions,
  extensionRegistry,
  type SKAMExtensionDefinition,
} from '@kanbun-skam/skam/extensions';
import { parse } from '@kanbun-skam/skam-xml-parser';
import { stringify } from '@kanbun-skam/skam-xml-stringify';
import { render, type RenderOptions } from '@kanbun-skam/skam-html-renderer';
import {
  render as renderCanvas,
  type CanvasRenderOptions,
} from '@kanbun-skam/skam-canvas-renderer';
import { SkamRendererElement } from '@kanbun-skam/skam-web-component';
// 副作用だけの import は型を解決できなくてもエラーにならない。名前空間の import にして解決を強制する
import * as autoModule from '@kanbun-skam/skam-web-component/auto';

void autoModule;
void buildAnnotationIR;
void defaultExtensions;
void extensionRegistry;
export type ExtensionDefinition = SKAMExtensionDefinition;
void SkamRendererElement;

const doc: SKAMDocument = parse('<skam:doc xmlns:skam="urn:skam:1"><skam:body/></skam:doc>');
const htmlOptions: RenderOptions = {};
const canvasOptions: CanvasRenderOptions = {};
const html: string = render(doc, htmlOptions).html;
const xml: string = stringify(doc);

// 実在の DOM の canvas を、キャストなしで渡せる (実行はしない。型だけを確かめる)
export function drawOn(canvas: HTMLCanvasElement): void {
  renderCanvas(doc, canvas, canvasOptions);
}

void html;
void xml;
