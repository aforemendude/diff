/*
 * Cleanup normalization derived from diff-match-patch-es v2.0.1 and Google Diff Match and Patch.
 *
 * Copyright 2018 The diff-match-patch Authors. Original implementation by Neil Fraser; TypeScript/ES module rewrite by
 * Anthony Fu. See https://github.com/google/diff-match-patch and https://github.com/antfu/diff-match-patch-es.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * Modified to operate on grapheme-token arrays and return compact copies instead of mutating public inputs.
 */

import { EQUAL, type Diff, type DiffOperation } from '../types.js';
import type { GraphemeDiff } from './common.js';
import { mergeEditBlocks } from './merge-edit-blocks.js';

const startsWith = (tokens: readonly string[], prefix: readonly string[]): boolean => {
  if (prefix.length > tokens.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index++) {
    if (tokens[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
};

const endsWith = (tokens: readonly string[], suffix: readonly string[]): boolean => {
  if (suffix.length > tokens.length) {
    return false;
  }
  const offset = tokens.length - suffix.length;
  for (let index = 0; index < suffix.length; index++) {
    if (tokens[offset + index] !== suffix[index]) {
      return false;
    }
  }
  return true;
};

const NO_NODE = -1;

interface NormalizedBlock {
  readonly firstEdit: number;
}

/**
 * Call-local, lazily linked storage for cleanup rewrites.
 *
 * The normalized tuples remain a plain dense array until the first structural rewrite. Calls that have no shifts or
 * trivial equalities therefore retain the small-input representation used by the array implementation. Stable,
 * never-reused numeric node IDs let the cleanup passes retain equality candidates without adjusting indices after every
 * insertion or removal.
 */
export class CleanupWorklist {
  private readonly entries: Array<GraphemeDiff | undefined>;
  private links: Int32Array | undefined;
  private firstIndex: number;

  public constructor(diffs: readonly Diff[]) {
    this.entries = mergeEditBlocks(diffs);
    this.firstIndex = this.entries.length === 0 ? NO_NODE : 0;
  }

  public get first(): number {
    return this.firstIndex;
  }

  public entry(index: number): GraphemeDiff | undefined {
    return this.entries[index];
  }

  public previous(index: number): number {
    const links = this.links;
    return links === undefined ? (index > 0 ? index - 1 : NO_NODE) : (links[index * 2] as number);
  }

  public next(index: number): number {
    const links = this.links;
    return links === undefined
      ? index + 1 < this.entries.length
        ? index + 1
        : NO_NODE
      : (links[index * 2 + 1] as number);
  }

  public setOperation(index: number, operation: DiffOperation): void {
    (this.entries[index] as GraphemeDiff)[0] = operation;
  }

  public insertAfter(index: number, operation: DiffOperation, tokens: string[]): number {
    return this.insertEntryAfter(index, [operation, tokens]);
  }

  private insertEntryAfter(index: number, entry: GraphemeDiff): number {
    this.ensureLinked(Math.max(this.entries.length + 1, this.entries.length * 2));
    const inserted = this.allocate(entry);
    const next = index === NO_NODE ? this.firstIndex : this.next(index);
    const links = this.links as Int32Array;

    links[inserted * 2] = index;
    links[inserted * 2 + 1] = next;
    if (index === NO_NODE) {
      this.firstIndex = inserted;
    } else {
      links[index * 2 + 1] = inserted;
    }
    if (next !== NO_NODE) {
      links[next * 2] = inserted;
    }
    return inserted;
  }

  /** Normalize edit blocks touched by equality elimination, then apply merge shifts. */
  public cleanupChanged(changedNodes: readonly number[]): void {
    for (const node of changedNodes) {
      const entry = this.entries[node];
      if (entry !== undefined && entry[0] !== EQUAL) {
        this.normalizeBlock(node);
      }
    }
    this.cleanupShifts();
  }

  /** Apply merge shifts in deterministic left-to-right order. */
  public cleanupShifts(): void {
    let cursor = this.firstEditAtOrAfter(this.firstIndex);

    while (cursor !== NO_NODE) {
      const leftIndex = this.previous(cursor);
      const rightIndex = this.next(cursor);
      if (leftIndex === NO_NODE || rightIndex === NO_NODE) {
        cursor = this.firstEditAtOrAfter(this.next(cursor));
        continue;
      }

      const left = this.entries[leftIndex] as GraphemeDiff;
      const edit = this.entries[cursor] as GraphemeDiff;
      const right = this.entries[rightIndex] as GraphemeDiff;
      if (left[0] !== EQUAL || right[0] !== EQUAL) {
        cursor = this.firstEditAtOrAfter(this.next(cursor));
        continue;
      }

      if (endsWith(edit[1], left[1])) {
        const leftTokens = left[1];
        const editTokens = edit[1];
        const editPrefixLength = editTokens.length - leftTokens.length;
        editTokens.copyWithin(leftTokens.length, 0, editPrefixLength);
        for (let index = 0; index < leftTokens.length; index++) {
          editTokens[index] = leftTokens[index] as string;
        }
        for (const token of right[1]) {
          leftTokens.push(token);
        }
        left[0] = edit[0];
        left[1] = editTokens;
        edit[0] = EQUAL;
        edit[1] = leftTokens;
        this.remove(rightIndex);
        cursor = this.normalizeBlock(leftIndex).firstEdit;
        continue;
      }

      if (startsWith(edit[1], right[1])) {
        const editTokens = edit[1];
        const rightTokens = right[1];
        const suffixStart = editTokens.length - rightTokens.length;
        editTokens.copyWithin(0, rightTokens.length);
        for (let index = 0; index < rightTokens.length; index++) {
          editTokens[suffixStart + index] = rightTokens[index] as string;
        }
        for (const token of rightTokens) {
          left[1].push(token);
        }
        this.remove(rightIndex);
        cursor = this.normalizeBlock(cursor).firstEdit;
        continue;
      }

      cursor = this.firstEditAtOrAfter(this.next(cursor));
    }
  }

  /** Flatten the live list while retaining its exclusively owned tuples and token arrays. */
  public toDiffs(): GraphemeDiff[] {
    if (this.links === undefined) {
      return this.entries as GraphemeDiff[];
    }

    const result: GraphemeDiff[] = [];
    for (let index = this.firstIndex; index !== NO_NODE; index = this.next(index)) {
      result.push(this.entries[index] as GraphemeDiff);
    }
    return result;
  }

  private firstEditAtOrAfter(index: number): number {
    let current = index;
    while (current !== NO_NODE && (this.entries[current] as GraphemeDiff)[0] === EQUAL) {
      current = this.next(current);
    }
    return current;
  }

  private ensureLinked(requiredNodes = this.entries.length): void {
    if (this.links !== undefined) {
      return;
    }

    const capacity = Math.max(8, requiredNodes);
    const links = new Int32Array(capacity * 2);
    links.fill(NO_NODE);
    for (let index = 0; index < this.entries.length; index++) {
      links[index * 2] = index === 0 ? NO_NODE : index - 1;
      links[index * 2 + 1] = index + 1 < this.entries.length ? index + 1 : NO_NODE;
    }
    this.links = links;
  }

  private allocate(entry: GraphemeDiff): number {
    const index = this.entries.length;
    this.growLinks(index + 1);
    this.entries.push(entry);
    return index;
  }

  private growLinks(requiredNodes: number): void {
    const links = this.links as Int32Array;
    if (requiredNodes * 2 <= links.length) {
      return;
    }

    let capacity = links.length;
    while (requiredNodes * 2 > capacity) {
      capacity *= 2;
    }
    const grown = new Int32Array(capacity);
    grown.fill(NO_NODE);
    grown.set(links);
    this.links = grown;
  }

  private remove(index: number): number {
    this.ensureLinked();
    const previous = this.previous(index);
    const next = this.next(index);
    const links = this.links as Int32Array;

    if (previous === NO_NODE) {
      this.firstIndex = next;
    } else {
      links[previous * 2 + 1] = next;
    }
    if (next !== NO_NODE) {
      links[next * 2] = previous;
    }
    this.entries[index] = undefined;
    links[index * 2] = NO_NODE;
    links[index * 2 + 1] = NO_NODE;
    return next;
  }

  /** Refactor one maximal edit block and return local traversal anchors. */
  private normalizeBlock(editIndex: number): NormalizedBlock {
    let first = editIndex;
    let last = editIndex;
    let adjacent = this.previous(first);
    while (adjacent !== NO_NODE && (this.entries[adjacent] as GraphemeDiff)[0] !== EQUAL) {
      first = adjacent;
      adjacent = this.previous(first);
    }
    adjacent = this.next(last);
    while (adjacent !== NO_NODE && (this.entries[adjacent] as GraphemeDiff)[0] !== EQUAL) {
      last = adjacent;
      adjacent = this.next(last);
    }

    if (first === last) {
      return { firstEdit: first };
    }

    const left = this.previous(first);
    const right = this.next(last);
    const block: GraphemeDiff[] = [];
    for (let index = first; ; index = this.next(index)) {
      block.push(this.entries[index] as GraphemeDiff);
      if (index === last) {
        break;
      }
    }
    const replacements = mergeEditBlocks(block);
    const blockNodes: number[] = [];
    for (let index = first; index !== right; index = this.next(index)) {
      blockNodes.push(index);
    }

    const replacementNodes: number[] = [];
    let anchor = left;
    for (let index = 0; index < replacements.length; index++) {
      const replacement = replacements[index] as GraphemeDiff;
      const existing = blockNodes[index];
      if (existing === undefined) {
        anchor = this.insertEntryAfter(anchor, replacement);
      } else {
        const entry = this.entries[existing] as GraphemeDiff;
        entry[0] = replacement[0];
        entry[1] = replacement[1];
        anchor = existing;
      }
      replacementNodes.push(anchor);
    }
    for (let index = replacements.length; index < blockNodes.length; index++) {
      this.remove(blockNodes[index] as number);
    }

    anchor = left;
    for (const replacementNode of replacementNodes) {
      const replacement = this.entries[replacementNode] as GraphemeDiff;
      const anchorEntry = anchor === NO_NODE ? undefined : this.entries[anchor];
      if (anchorEntry !== undefined && anchorEntry[0] === replacement[0]) {
        for (const token of replacement[1]) {
          anchorEntry[1].push(token);
        }
        this.remove(replacementNode);
      } else {
        anchor = replacementNode;
      }
    }

    const rightEntry = right === NO_NODE ? undefined : this.entries[right];
    const anchorEntry = anchor === NO_NODE ? undefined : this.entries[anchor];
    if (rightEntry !== undefined && anchorEntry !== undefined && rightEntry[0] === anchorEntry[0]) {
      for (const token of rightEntry[1]) {
        anchorEntry[1].push(token);
      }
      this.remove(right);
    }

    const regionStart = left === NO_NODE ? this.firstIndex : this.next(left);
    return {
      firstEdit: this.firstEditAtOrAfter(regionStart),
    };
  }
}
