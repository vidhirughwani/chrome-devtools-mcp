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
    // const page = request.page;

    // await page.pptrPage.captureHeapSnapshot({
    //   path: request.params.filePath,
    // });

    const absolutePath = path.resolve(request.params.filePath);

    const workerProxy =
      new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(
        () => {
          /* noop */
        },
        import.meta.resolve('../third_party/devtools-heap-snapshot-worker.js'),
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
      response.appendResponseLine(
        `Static Data: ${JSON.stringify(snapshot.staticData, null, 2)}`,
      );

      const filter =
        new DevTools.HeapSnapshotModel.HeapSnapshotModel.NodeFilter();
      const aggregates = await snapshot.aggregatesWithFilter(filter);

      const {pageSize, pageIdx} = request.params;
      response.setHeapSnapshot(aggregates, {pageSize, pageIdx});
    } catch (err) {
      response.appendResponseLine(`Parsing failed: ${err}`);
    } finally {
      workerProxy.dispose();
    }
  },
});

export const compareMemorySnapshots = definePageTool({
  name: 'compare_memory_snapshots',
  description: 'Compare two heap snapshots and return the diff.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  schema: {
    beforeFilePath: zod.string().describe('Path to the before snapshot.'),
    afterFilePath: zod.string().describe('Path to the after snapshot.'),
    pageSize: zod.number().optional().describe('Page size for pagination.'),
    pageIdx: zod.number().optional().describe('Page index for pagination.'),
  },
  handler: async (request, response, _context) => {
    const {beforeFilePath, afterFilePath} = request.params;

    async function loadSnapshot(filePath: string) {
      const absolutePath = path.resolve(filePath);
      const workerProxy =
        new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(
          () => {
            /* noop */
          },
          import.meta
            .resolve('../third_party/devtools-heap-snapshot-worker.js'),
        );
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
      return {snapshot: await snapshotPromise, workerProxy};
    }

    const {snapshot: snapshotBefore, workerProxy: worker1} =
      await loadSnapshot(beforeFilePath);
    const {snapshot: snapshotAfter, workerProxy: worker2} =
      await loadSnapshot(afterFilePath);

    try {
      const interfaceDefs = await snapshotAfter.interfaceDefinitions();
      const aggregatesForDiff =
        await snapshotBefore.aggregatesForDiff(interfaceDefs);
      const diff = await snapshotAfter.calculateSnapshotDiff(
        'before',
        aggregatesForDiff,
      );

      if (diff && typeof diff === 'object') {
        const {pageSize, pageIdx} = request.params;
        response.setHeapDiff(diff, {pageSize, pageIdx});
      } else {
        response.appendResponseLine('No diff data returned.');
      }
    } catch (err) {
      response.appendResponseLine(`Comparison failed: ${err}`);
    } finally {
      worker1.dispose();
      worker2.dispose();
    }
  },
});
