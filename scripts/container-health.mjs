import { stat } from 'node:fs/promises';
try {
  if (process.argv[2] === 'worker') {
    const heartbeat = await stat(process.env.WORKER_HEARTBEAT_FILE || '/tmp/wrc-worker-heartbeat');
    if (Date.now() - heartbeat.mtimeMs > 60_000) throw new Error('Worker heartbeat expired');
  } else {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || '3000'}/health/ready`, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error('API is not ready');
  }
} catch {
  process.exitCode = 1;
}
