/**
 * ブロックユーティリティ
 */

import type { Block, Token } from '../index.js';

/**
 * doc.blocks を使って Token をブロックごとにグループ化
 *
 * blocks が存在する場合は各 block の tokenIds から tokens を解決する。
 * blocks が空の場合は全 tokens を blockId='' の単一グループとして返す。
 */
export function groupTokensByBlock(
  blocks: Block[],
  tokens: Token[]
): { blockId: string; tokens: Token[] }[] {
  if (blocks.length === 0) {
    return tokens.length > 0 ? [{ blockId: '', tokens }] : [];
  }

  const tokenMap = new Map<string, Token>();
  for (const token of tokens) {
    tokenMap.set(token.id, token);
  }

  const groups: { blockId: string; tokens: Token[] }[] = [];
  for (const block of blocks) {
    const blockTokens: Token[] = [];
    for (const tokenId of block.tokenIds) {
      const token = tokenMap.get(tokenId);
      if (token) {
        blockTokens.push(token);
      }
    }
    if (blockTokens.length > 0) {
      groups.push({ blockId: block.id, tokens: blockTokens });
    }
  }

  return groups;
}
