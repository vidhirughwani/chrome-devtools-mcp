/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {zod, DevTools} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

export const takeMemorySnapshot = definePageTool({
  name: 'take_memory_snapshot',
  description: `Capture a heap snapshot of the currently selected page. Use to analyze the memory distribution of JavaScript objects and debug memory leaks.`,
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: false,
  },
  schema: {
    filePath: zod
      .string()
      .describe('A path to a .heapsnapshot file to save the heapsnapshot to.'),
  },
  handler: async (request, response, _context) => {
    const page = request.page;

    await page.pptrPage.captureHeapSnapshot({
      path: request.params.filePath,
    });

    response.appendResponseLine(
      `Heap snapshot saved to ${request.params.filePath}`,
    );
  },
});

export const exploreMemorySnapshot = definePageTool({
  name: 'explored_memory_snapshot',
  description: 'Explose ',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod
      .string()
      .describe('A path to a .heapsnapshot file to save the heapsnapshot to.'),
    pageSize: zod.number().optional().describe('Page size for pagination.'),
    pageIdx: zod.number().optional().describe('Page index for pagination.'),
  },
  handler: async (request, response, _context) => {
    const page = request.page;

    await page.pptrPage.captureHeapSnapshot({
      path: request.params.filePath,
    });

    const absolutePath = path.resolve(request.params.filePath);
    const workerProxy =
      new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(
        () => {
          /* noop */
        },
      );

    try {
      const {promise: snapshotPromise, resolve: resolveSnapshot} =
        Promise.withResolvers<DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy>();

      const loaderProxy = workerProxy.createLoader(
        1,
        (
          snapshotProxy: DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotProxy,
        ) => {
          resolveSnapshot(snapshotProxy);
        },
      );

      const fileStream = fs.createReadStream(absolutePath, {
        encoding: 'utf-8',
        highWaterMark: 1024 * 1024,
      });

      for await (const chunk of fileStream) {
        await loaderProxy.write(chunk);
      }

      await loaderProxy.close();

      const snapshot = await snapshotPromise;
      const stats = await snapshot.getStatistics();

      response.appendResponseLine(
        `Statistics: ${JSON.stringify(stats, null, 2)}`,
      );

      const aggregates = await snapshot.getAggregatesByClassKey(
        true,
        'allObjects',
      );

      const {pageSize, pageIdx} = request.params;
      response.setHeapSnapshot(aggregates, {pageSize, pageIdx});
    } catch (err) {
      response.appendResponseLine(`Parsing failed: ${err}`);
    } finally {
      workerProxy.dispose();
    }
  },
});
