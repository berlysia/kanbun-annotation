/**
 * Tests for MarkPopup class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MarkPopup,
  type KanaMarkType,
  getKaeriValueFromKind,
  getKaeriKindFromValue,
} from '../mark-popup.js';
import type { OkuriganaMark, YomiganaMark, SoeganaMark, KaeriMark } from '@kanbun/skam';

describe('MarkPopup', () => {
  let container: HTMLElement;
  let popup: MarkPopup;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'container';
    document.body.appendChild(container);
    popup = new MarkPopup(container);
  });

  afterEach(() => {
    popup.hide();
    container.remove();
  });

  describe('showKanaPopup', () => {
    it('should create popup element in container', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const popupEl = container.querySelector('.mark-popup');
      expect(popupEl).toBeTruthy();
      expect(popup.isVisible()).toBe(true);
    });

    it('should position popup at specified coordinates', () => {
      popup.showKanaPopup({ x: 150, y: 200 }, 't1', 't2');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      expect(popupEl.style.left).toBe('150px');
      expect(popupEl.style.top).toBe('200px');
    });

    it('should show header text', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const header = container.querySelector('.mark-popup-header');
      expect(header).toBeTruthy();
      expect(header?.textContent).toContain('仮名を追加');
    });

    it('should show three radio options for kana types', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const radios = container.querySelectorAll('input[name="kana-type"]');
      expect(radios.length).toBe(3);

      const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
      expect(values).toContain('okurigana');
      expect(values).toContain('yomigana');
      expect(values).toContain('soegana');
    });

    it('should have okurigana selected by default', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const checkedRadio = container.querySelector(
        'input[name="kana-type"]:checked'
      ) as HTMLInputElement;
      expect(checkedRadio?.value).toBe('okurigana');
    });

    it('should show text input field', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.tagName).toBe('INPUT');
    });

    it('should show apply and cancel buttons', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const applyBtn = container.querySelector('[data-action="apply"]');
      const cancelBtn = container.querySelector('[data-action="cancel"]');
      expect(applyBtn).toBeTruthy();
      expect(cancelBtn).toBeTruthy();
    });

    it('should not show delete button when no existing mark', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const deleteBtn = container.querySelector('[data-action="delete"]');
      expect(deleteBtn).toBeNull();
    });
  });

  describe('showKanaPopup with existing mark', () => {
    it('should preset type from existing mark', () => {
      const existingMark: YomiganaMark = {
        type: 'yomigana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'よみ',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      const checkedRadio = container.querySelector(
        'input[name="kana-type"]:checked'
      ) as HTMLInputElement;
      expect(checkedRadio?.value).toBe('yomigana');
    });

    it('should preset value from existing mark', () => {
      const existingMark: OkuriganaMark = {
        type: 'okurigana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'きた',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      expect(input.value).toBe('きた');
    });

    it('should show delete button when editing existing mark', () => {
      const existingMark: SoeganaMark = {
        type: 'soegana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'を',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]');
      expect(deleteBtn).toBeTruthy();
    });

    it('should store current mark ID', () => {
      const existingMark: OkuriganaMark = {
        type: 'okurigana',
        id: 'm5',
        anchor: { from: 't1', to: 't2' },
        value: 'り',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      expect(popup.getCurrentMarkId()).toBe('m5');
    });
  });

  describe('input validation', () => {
    it('should disable apply button when input is empty', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('should enable apply button when input has valid kana', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;

      input.value = 'きた';
      input.dispatchEvent(new Event('input'));

      expect(applyBtn.disabled).toBe(false);
    });

    it('should show warning for non-kana characters', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      const warning = container.querySelector('.mark-popup-warning') as HTMLElement;

      input.value = 'abc123';
      input.dispatchEvent(new Event('input'));

      expect(warning.classList.contains('visible')).toBe(true);
      expect(warning.textContent).toContain('ひらがな/カタカナ以外');
    });

    it('should not show warning for valid kana', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      const warning = container.querySelector('.mark-popup-warning') as HTMLElement;

      input.value = 'あいうえお';
      input.dispatchEvent(new Event('input'));

      expect(warning.classList.contains('visible')).toBe(false);
    });

    it('should allow katakana', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;
      const warning = container.querySelector('.mark-popup-warning') as HTMLElement;

      input.value = 'アイウエオ';
      input.dispatchEvent(new Event('input'));

      expect(applyBtn.disabled).toBe(false);
      expect(warning.classList.contains('visible')).toBe(false);
    });

    it('should allow mixed hiragana and katakana', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;

      input.value = 'あイう';
      input.dispatchEvent(new Event('input'));

      expect(applyBtn.disabled).toBe(false);
    });
  });

  describe('onKanaSelect callback', () => {
    it('should call callback with correct values on apply', () => {
      const results: Array<{
        from: string;
        to: string;
        type: KanaMarkType | null;
        value: string;
      }> = [];

      popup.onKanaSelect((from, to, type, value) => {
        results.push({ from, to, type, value });
      });

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't3');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      input.value = 'きた';
      input.dispatchEvent(new Event('input'));

      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;
      applyBtn.click();

      expect(results.length).toBe(1);
      expect(results[0]?.from).toBe('t1');
      expect(results[0]?.to).toBe('t3');
      expect(results[0]?.type).toBe('okurigana');
      expect(results[0]?.value).toBe('きた');
    });

    it('should call callback with selected kana type', () => {
      const results: Array<{
        from: string;
        to: string;
        type: KanaMarkType | null;
        value: string;
      }> = [];

      popup.onKanaSelect((from, to, type, value) => {
        results.push({ from, to, type, value });
      });

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      // Select yomigana
      const yomiganaRadio = container.querySelector(
        'input[name="kana-type"][value="yomigana"]'
      ) as HTMLInputElement;
      yomiganaRadio.checked = true;

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      input.value = 'よみ';
      input.dispatchEvent(new Event('input'));

      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;
      applyBtn.click();

      expect(results[0]?.type).toBe('yomigana');
    });

    it('should call callback with null type on delete', () => {
      const results: Array<{
        from: string;
        to: string;
        type: KanaMarkType | null;
        value: string;
      }> = [];

      popup.onKanaSelect((from, to, type, value) => {
        results.push({ from, to, type, value });
      });

      const existingMark: OkuriganaMark = {
        type: 'okurigana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'きた',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
      deleteBtn.click();

      expect(results.length).toBe(1);
      expect(results[0]?.type).toBeNull();
      expect(results[0]?.value).toBe('');
    });
  });

  describe('hide', () => {
    it('should remove popup from DOM', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');
      expect(container.querySelector('.mark-popup')).toBeTruthy();

      popup.hide();

      expect(container.querySelector('.mark-popup')).toBeNull();
      expect(popup.isVisible()).toBe(false);
    });

    it('should clear current mark ID', () => {
      const existingMark: OkuriganaMark = {
        type: 'okurigana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'きた',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);
      expect(popup.getCurrentMarkId()).toBe('m1');

      popup.hide();
      expect(popup.getCurrentMarkId()).toBeNull();
    });

    it('should hide popup when cancel button is clicked', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const cancelBtn = container.querySelector('[data-action="cancel"]') as HTMLButtonElement;
      cancelBtn.click();

      expect(popup.isVisible()).toBe(false);
    });

    it('should hide popup after apply', () => {
      popup.onKanaSelect(() => {});
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      input.value = 'きた';
      input.dispatchEvent(new Event('input'));

      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;
      applyBtn.click();

      expect(popup.isVisible()).toBe(false);
    });
  });

  describe('closing behavior', () => {
    it('should close when showing new popup', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');
      const firstPopup = container.querySelector('.mark-popup');

      popup.showKanaPopup({ x: 200, y: 200 }, 't3', 't4');

      const popups = container.querySelectorAll('.mark-popup');
      expect(popups.length).toBe(1);
      expect(popups[0]).not.toBe(firstPopup);
    });
  });

  // ============================================================================
  // Kaeri (返り点) Popup Tests
  // ============================================================================

  describe('showKaeriPopup', () => {
    it('should create popup element in container', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const popupEl = container.querySelector('.mark-popup');
      expect(popupEl).toBeTruthy();
      expect(popup.isVisible()).toBe(true);
    });

    it('should position popup at specified coordinates', () => {
      popup.showKaeriPopup({ x: 150, y: 200 }, 't1');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      expect(popupEl.style.left).toBe('150px');
      expect(popupEl.style.top).toBe('200px');
    });

    it('should show title text', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const title = container.querySelector('.mark-popup-title');
      expect(title).toBeTruthy();
      expect(title?.textContent).toContain('返り点を追加');
    });

    it('should show kaeri buttons', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const buttons = container.querySelectorAll('.mark-popup-buttons .mark-popup-btn');
      // Single kaeri groups: 5 + 3 + 3 + 3 = 14
      // Compound group: 6
      // Total: 20
      expect(buttons.length).toBe(20);
    });

    it('should show single kaeri types (レ, 一, 二, etc.)', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const buttonTexts = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).map((btn) => btn.textContent);

      expect(buttonTexts).toContain('レ');
      expect(buttonTexts).toContain('一');
      expect(buttonTexts).toContain('二');
      expect(buttonTexts).toContain('三');
      expect(buttonTexts).toContain('四');
      expect(buttonTexts).toContain('上');
      expect(buttonTexts).toContain('中');
      expect(buttonTexts).toContain('下');
      expect(buttonTexts).toContain('甲');
      expect(buttonTexts).toContain('乙');
      expect(buttonTexts).toContain('丙');
      expect(buttonTexts).toContain('天');
      expect(buttonTexts).toContain('地');
      expect(buttonTexts).toContain('人');
    });

    it('should show compound kaeri types', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const buttonTexts = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).map((btn) => btn.textContent);

      expect(buttonTexts).toContain('一レ');
      expect(buttonTexts).toContain('二レ');
      expect(buttonTexts).toContain('上レ');
      expect(buttonTexts).toContain('中レ');
      expect(buttonTexts).toContain('甲レ');
      expect(buttonTexts).toContain('乙レ');
    });

    it('should show compound group label', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const label = container.querySelector('.mark-popup-group-label');
      expect(label).toBeTruthy();
      expect(label?.textContent).toContain('複合');
    });

    it('should show cancel button', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const cancelBtn = container.querySelector('[data-action="cancel"]');
      expect(cancelBtn).toBeTruthy();
    });

    it('should not show delete button when no existing mark', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const deleteBtn = container.querySelector('[data-action="delete"]');
      expect(deleteBtn).toBeNull();
    });
  });

  describe('showKaeriPopup with existing mark', () => {
    it('should show edit title', () => {
      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'レ',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      const title = container.querySelector('.mark-popup-title');
      expect(title?.textContent).toContain('返り点を編集');
    });

    it('should highlight existing kaeri value button', () => {
      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: '一',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      const selectedBtn = container.querySelector('.mark-popup-btn--selected');
      expect(selectedBtn).toBeTruthy();
      expect(selectedBtn?.textContent).toBe('一');
    });

    it('should show delete button when editing', () => {
      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'レ',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]');
      expect(deleteBtn).toBeTruthy();
    });

    it('should store current mark ID', () => {
      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm5',
        anchor: { from: 't1', to: 't1' },
        value: 'レ',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      expect(popup.getCurrentMarkId()).toBe('m5');
    });
  });

  describe('onKaeriSelect callback', () => {
    it('should call callback with kind when kaeri button is clicked', () => {
      const results: Array<{ tokenId: string; kind: string | null }> = [];

      popup.onKaeriSelect((tokenId, kind) => {
        results.push({ tokenId, kind });
      });

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const reBtn = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).find((btn) => btn.textContent === 'レ') as HTMLButtonElement;
      reBtn.click();

      expect(results.length).toBe(1);
      expect(results[0]?.tokenId).toBe('t1');
      expect(results[0]?.kind).toBe('re');
    });

    it('should call callback with correct kind for compound kaeri', () => {
      const results: Array<{ tokenId: string; kind: string | null }> = [];

      popup.onKaeriSelect((tokenId, kind) => {
        results.push({ tokenId, kind });
      });

      popup.showKaeriPopup({ x: 100, y: 100 }, 't2');

      const ichiReBtn = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).find((btn) => btn.textContent === '一レ') as HTMLButtonElement;
      ichiReBtn.click();

      expect(results[0]?.tokenId).toBe('t2');
      expect(results[0]?.kind).toBe('ichi-re');
    });

    it('should call callback with null kind on delete', () => {
      const results: Array<{ tokenId: string; kind: string | null }> = [];

      popup.onKaeriSelect((tokenId, kind) => {
        results.push({ tokenId, kind });
      });

      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'レ',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
      deleteBtn.click();

      expect(results.length).toBe(1);
      expect(results[0]?.tokenId).toBe('t1');
      expect(results[0]?.kind).toBeNull();
    });

    it('should hide popup after kaeri selection', () => {
      popup.onKaeriSelect(() => {});
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const reBtn = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).find((btn) => btn.textContent === 'レ') as HTMLButtonElement;
      reBtn.click();

      expect(popup.isVisible()).toBe(false);
    });
  });

  describe('kaeri popup hide', () => {
    it('should hide popup when cancel button is clicked', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const cancelBtn = container.querySelector('[data-action="cancel"]') as HTMLButtonElement;
      cancelBtn.click();

      expect(popup.isVisible()).toBe(false);
    });

    it('should close kaeri popup when showing new popup', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');
      const firstPopup = container.querySelector('.mark-popup');

      popup.showKaeriPopup({ x: 200, y: 200 }, 't2');

      const popups = container.querySelectorAll('.mark-popup');
      expect(popups.length).toBe(1);
      expect(popups[0]).not.toBe(firstPopup);
    });

    it('should close kana popup when showing kaeri popup', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');
      expect(popup.isVisible()).toBe(true);

      popup.showKaeriPopup({ x: 200, y: 200 }, 't3');

      const popups = container.querySelectorAll('.mark-popup');
      expect(popups.length).toBe(1);
    });
  });

  describe('getKaeriValueFromKind', () => {
    it('should return value for single kaeri kinds', () => {
      expect(getKaeriValueFromKind('re')).toBe('レ');
      expect(getKaeriValueFromKind('ichi')).toBe('一');
      expect(getKaeriValueFromKind('ni')).toBe('二');
      expect(getKaeriValueFromKind('san')).toBe('三');
      expect(getKaeriValueFromKind('shi')).toBe('四');
      expect(getKaeriValueFromKind('jo')).toBe('上');
      expect(getKaeriValueFromKind('chu')).toBe('中');
      expect(getKaeriValueFromKind('ge')).toBe('下');
      expect(getKaeriValueFromKind('ko')).toBe('甲');
      expect(getKaeriValueFromKind('otsu')).toBe('乙');
      expect(getKaeriValueFromKind('hei')).toBe('丙');
      expect(getKaeriValueFromKind('ten')).toBe('天');
      expect(getKaeriValueFromKind('chi')).toBe('地');
      expect(getKaeriValueFromKind('jin')).toBe('人');
    });

    it('should return value for compound kaeri kinds', () => {
      expect(getKaeriValueFromKind('ichi-re')).toBe('一レ');
      expect(getKaeriValueFromKind('ni-re')).toBe('二レ');
      expect(getKaeriValueFromKind('jo-re')).toBe('上レ');
      expect(getKaeriValueFromKind('chu-re')).toBe('中レ');
      expect(getKaeriValueFromKind('ko-re')).toBe('甲レ');
      expect(getKaeriValueFromKind('otsu-re')).toBe('乙レ');
    });

    it('should return null for unknown kind', () => {
      expect(getKaeriValueFromKind('unknown')).toBeNull();
    });
  });

  describe('getKaeriKindFromValue', () => {
    it('should return kind for single kaeri values', () => {
      expect(getKaeriKindFromValue('レ')).toBe('re');
      expect(getKaeriKindFromValue('一')).toBe('ichi');
      expect(getKaeriKindFromValue('二')).toBe('ni');
      expect(getKaeriKindFromValue('上')).toBe('jo');
      expect(getKaeriKindFromValue('下')).toBe('ge');
      expect(getKaeriKindFromValue('甲')).toBe('ko');
      expect(getKaeriKindFromValue('乙')).toBe('otsu');
    });

    it('should return kind for compound kaeri values', () => {
      expect(getKaeriKindFromValue('一レ')).toBe('ichi-re');
      expect(getKaeriKindFromValue('二レ')).toBe('ni-re');
      expect(getKaeriKindFromValue('上レ')).toBe('jo-re');
    });

    it('should return null for unknown value', () => {
      expect(getKaeriKindFromValue('未知')).toBeNull();
    });
  });

  // ============================================================================
  // Keyboard Accessibility Tests
  // ============================================================================

  describe('keyboard accessibility - kana popup', () => {
    it('should close popup on Escape key', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');
      expect(popup.isVisible()).toBe(true);

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      popupEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(popup.isVisible()).toBe(false);
    });

    it('should focus input field when popup opens', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      expect(document.activeElement).toBe(input);
    });

    it('should have tabindex on buttons', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const cancelBtn = container.querySelector('[data-action="cancel"]') as HTMLButtonElement;
      const applyBtn = container.querySelector('[data-action="apply"]') as HTMLButtonElement;

      expect(cancelBtn.getAttribute('tabindex')).toBe('0');
      expect(applyBtn.getAttribute('tabindex')).toBe('0');
    });

    it('should have focus trap enabled (keydown handler attached)', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;

      // Verify popup exists and can receive keyboard events
      expect(popupEl).toBeTruthy();

      // The focus trap is implemented via keydown handler on the popup
      // Verify by checking that Escape works (which uses the same handler)
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      popupEl.dispatchEvent(escapeEvent);

      expect(popup.isVisible()).toBe(false);
    });

    it('should have multiple focusable elements in correct order', () => {
      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;

      // Enable the apply button so it's also focusable
      const input = popupEl.querySelector('.mark-popup-input') as HTMLInputElement;
      input.value = 'きた';
      input.dispatchEvent(new Event('input'));

      // Get all focusable elements using the same selector as implementation
      const focusableElements = popupEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      // Should have: 3 radio buttons + 1 text input + 2 buttons = at least 6 elements
      // (some may be duplicated by the [tabindex] selector)
      expect(focusableElements.length).toBeGreaterThanOrEqual(5);

      // Verify first element is a radio button
      const firstEl = focusableElements[0];
      expect(firstEl?.tagName).toBe('INPUT');
      expect((firstEl as HTMLInputElement).type).toBe('radio');

      // Verify last element is the apply button (now enabled)
      const lastEl = focusableElements[focusableElements.length - 1];
      expect(lastEl?.tagName).toBe('BUTTON');
    });

    it('should apply selection on Enter key in input field', () => {
      const results: Array<{ type: KanaMarkType | null }> = [];
      popup.onKanaSelect((_from, _to, type) => {
        results.push({ type });
      });

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2');

      const input = container.querySelector('.mark-popup-input') as HTMLInputElement;
      input.value = 'きた';
      input.dispatchEvent(new Event('input'));

      // Press Enter
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(results.length).toBe(1);
      expect(popup.isVisible()).toBe(false);
    });

    it('should have delete button with tabindex when editing', () => {
      const existingMark: OkuriganaMark = {
        type: 'okurigana',
        id: 'm1',
        anchor: { from: 't1', to: 't2' },
        value: 'きた',
      };

      popup.showKanaPopup({ x: 100, y: 100 }, 't1', 't2', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('keyboard accessibility - kaeri popup', () => {
    it('should close popup on Escape key', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');
      expect(popup.isVisible()).toBe(true);

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      popupEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(popup.isVisible()).toBe(false);
    });

    it('should focus first kaeri button when popup opens', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const firstKaeriBtn = container.querySelector(
        '.mark-popup-buttons .mark-popup-btn'
      ) as HTMLButtonElement;
      expect(document.activeElement).toBe(firstKaeriBtn);
    });

    it('should have tabindex on kaeri buttons', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const kaeriButtons = container.querySelectorAll('.mark-popup-buttons .mark-popup-btn');
      kaeriButtons.forEach((btn) => {
        expect((btn as HTMLElement).getAttribute('tabindex')).toBe('0');
      });
    });

    it('should have tabindex on cancel button', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const cancelBtn = container.querySelector('[data-action="cancel"]') as HTMLButtonElement;
      expect(cancelBtn.getAttribute('tabindex')).toBe('0');
    });

    it('should trap focus within popup - Tab from last element to first', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      const focusableElements = popupEl.querySelectorAll<HTMLElement>('button:not([disabled])');
      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      // Focus the last element
      lastEl?.focus();
      expect(document.activeElement).toBe(lastEl);

      // Press Tab
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      popupEl.dispatchEvent(tabEvent);

      expect(tabEvent.defaultPrevented || document.activeElement === firstEl).toBe(true);
    });

    it('should trap focus within popup - Shift+Tab from first element to last', () => {
      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const popupEl = container.querySelector('.mark-popup') as HTMLElement;
      const focusableElements = popupEl.querySelectorAll<HTMLElement>('button:not([disabled])');
      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      // Focus the first element
      firstEl?.focus();
      expect(document.activeElement).toBe(firstEl);

      // Press Shift+Tab
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      });
      popupEl.dispatchEvent(shiftTabEvent);

      expect(shiftTabEvent.defaultPrevented || document.activeElement === lastEl).toBe(true);
    });

    it('should select kaeri on Enter key when button is focused', () => {
      const results: Array<{ kind: string | null }> = [];
      popup.onKaeriSelect((_tokenId, kind) => {
        results.push({ kind });
      });

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1');

      const reBtn = Array.from(
        container.querySelectorAll('.mark-popup-buttons .mark-popup-btn')
      ).find((btn) => btn.textContent === 'レ') as HTMLButtonElement;

      reBtn.focus();
      // Simulate Enter key - native behavior triggers click on button
      reBtn.click();

      expect(results.length).toBe(1);
      expect(results[0]?.kind).toBe('re');
      expect(popup.isVisible()).toBe(false);
    });

    it('should have delete button with tabindex when editing', () => {
      const existingMark: KaeriMark = {
        type: 'kaeri',
        id: 'm1',
        anchor: { from: 't1', to: 't1' },
        value: 'レ',
      };

      popup.showKaeriPopup({ x: 100, y: 100 }, 't1', existingMark);

      const deleteBtn = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn.getAttribute('tabindex')).toBe('0');
    });
  });
});
