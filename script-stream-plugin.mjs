// Local Harness extension: forward live provider deltas over the SDK's NDJSON
// transport. Durable session events still own tool results and final responses.
export const name = 'morri-script-stream';
export const inject = ['llm'];
export function apply(ctx) {
  let sequence = 0;
  ctx.on('llm/stream', (options, next) => {
    if (!options.sessionId) return next();
    const requestId = ++sequence;
    const notify = (event) => process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', method: 'morri.stream',
      params: {sessionId: String(options.sessionId), requestId, ...event},
    }) + '\n');
    return (async function* () {
      notify({type: 'start'});
      for await (const chunk of next()) {
        if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
          notify({type: chunk.type, index: chunk.index, text: chunk.text});
        }
        yield chunk;
      }
    })();
  });
}
