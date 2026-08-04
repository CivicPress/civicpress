/**
 * Read a single line from stdin — used by `--password-stdin` flags so a secret
 * (e.g. an admin password) never lands in argv, the shell history, or the
 * process list. Resolves the first line without its trailing newline, or the
 * whole input if it contains no newline (e.g. `printf 'pw'` with no `\n`).
 */
export function readStdinLine(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk: string) => {
      data += chunk;
      const nl = data.indexOf('\n');
      if (nl !== -1) {
        cleanup();
        resolve(data.slice(0, nl));
      }
    };
    const onEnd = () => {
      cleanup();
      resolve(data);
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onErr);
      process.stdin.pause();
    };
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onErr);
  });
}
