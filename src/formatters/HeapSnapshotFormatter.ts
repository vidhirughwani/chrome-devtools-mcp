/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {DevTools} from '../third_party/index.js';

export interface FormattedSnapshotEntry {
  className: string;
  count: number;
  selfSize: number;
  retainedSize: number;
}

export class HeapSnapshotFormatter {
  #aggregates: Record<
    string,
    DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
  >;

  constructor(
    aggregates: Record<
      string,
      DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
    >,
  ) {
    this.#aggregates = aggregates;
  }

  toString(): string {
    const entries = Object.entries(this.#aggregates);
    // Sort by self size descending
    const sorted = entries.sort((a, b) => b[1].self - a[1].self);

    const lines: string[] = [];
    lines.push('className,count,selfSize,maxRetainedSize');

    for (const [, info] of sorted) {
      lines.push(`"${info.name}",${info.count},${info.self},${info.maxRet}`);
    }

    return lines.join('\n');
  }

  toJSON(): FormattedSnapshotEntry[] {
    const entries = Object.entries(this.#aggregates);
    const sorted = entries.sort((a, b) => b[1].self - a[1].self);
    return sorted.map(([, info]) => ({
      className: info.name,
      count: info.count,
      selfSize: info.self,
      retainedSize: info.maxRet,
    }));
  }
}
