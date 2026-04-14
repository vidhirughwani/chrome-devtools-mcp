/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {DevTools} from '../third_party/index.js';

export interface FormattedDiffEntry {
  className: string;
  added: number;
  deleted: number;
  deltaSize: number;
}

export class HeapDiffFormatter {
  #diff: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff>;

  constructor(diff: Record<string, DevTools.HeapSnapshotModel.HeapSnapshotModel.Diff>) {
    this.#diff = diff;
  }

  toString(): string {
    const entries = Object.entries(this.#diff);
    const sorted = entries.sort((a, b) => b[1].sizeDelta - a[1].sizeDelta);
    
    const lines: string[] = [];
    
    for (const [, d] of sorted) {
      lines.push(`class="${d.name}" added=${d.addedCount} deleted=${d.removedCount} deltaSize=${d.sizeDelta}`);
    }
    
    return lines.join('\n');
  }

  toJSON(): FormattedDiffEntry[] {
    const entries = Object.entries(this.#diff);
    const sorted = entries.sort((a, b) => b[1].sizeDelta - a[1].sizeDelta);
    return sorted.map(([, d]) => ({
      className: d.name,
      added: d.addedCount,
      deleted: d.removedCount,
      deltaSize: d.sizeDelta,
    }));
  }
}
