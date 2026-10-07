import { CError } from '../c/lexer';

export function Terminal({
  command,
  output,
  exitCode,
  error,
  running,
}: {
  command: string;
  output: string;
  exitCode?: number | null;
  error?: CError | null;
  running?: boolean;
}) {
  const compile = error?.kind === 'compile';
  return (
    <div className="term">
      <span className="prompt">$ </span>
      <span className="cmd">{compile ? 'make' : command}</span>
      {'\n'}
      {compile ? (
        <span className="err">
          error{error!.line ? ` on line ${error!.line}` : ''}: {error!.message}
          {'\n'}
        </span>
      ) : (
        <>
          {output}
          {output && !output.endsWith('\n') && (running || exitCode !== undefined) ? '\n' : ''}
          {error && (
            <span className="err">
              {error.message}
              {error.line ? ` (line ${error.line})` : ''}
              {'\n'}
            </span>
          )}
          {running ? (
            <span className="cursor" />
          ) : exitCode !== undefined && exitCode !== null ? (
            <span className="exit">exit status {exitCode}</span>
          ) : null}
        </>
      )}
    </div>
  );
}
