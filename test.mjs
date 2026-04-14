import {DevTools} from './build/src/third_party/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Please provide a file path to the heap snapshot.');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  console.log(`Parsing snapshot from: ${absolutePath}`);

  const workerProxy =
    new DevTools.HeapSnapshotModel.HeapSnapshotProxy.HeapSnapshotWorkerProxy(
      () => {},
      import.meta
        .resolve('./build/src/third_party/devtools-heap-snapshot-worker.js'),
    );

  let resolveSnapshot;
  const snapshotPromise = new Promise(resolve => {
    resolveSnapshot = resolve;
  });

  const loaderProxy = workerProxy.createLoader(1, snapshotProxy => {
    console.log('Snapshot received callback!');
    resolveSnapshot(snapshotProxy);
  });

  const fileStream = fs.createReadStream(absolutePath, {
    encoding: 'utf-8',
    highWaterMark: 1024 * 1024,
  });

  for await (const chunk of fileStream) {
    await loaderProxy.write(chunk);
  }

  console.log('Waiting for close/build...');
  await loaderProxy.close();
  console.log('Loader closed.');

  const snapshot = await snapshotPromise;
  const stats = await snapshot.getStatistics();
  console.log('Statistics from snapshot:', JSON.stringify(stats, null, 2));

  const staticData = snapshot.staticData;
  console.log('Static data from worker:', JSON.stringify(staticData, null, 2));

  workerProxy.dispose();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
