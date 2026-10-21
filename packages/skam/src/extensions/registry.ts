/**
 * 拡張の登録簿 (機械で読める表)。名前、SKAM-ML の名前空間の URI、必須かどうかの照合に使う。
 * 人が読む一覧は SKAM-draft の付録。登録は名前の衝突を避けるためで、拡張の中身の安全を保証しない。
 */

export interface ExtensionRegistryEntry {
  readonly name: string;
  readonly uri: string;
  readonly required: boolean;
}

export const extensionRegistry: readonly ExtensionRegistryEntry[] = [];
