import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface SnapshotOptions {
  sourceRoots: string[];
  maxBytes: number;
  maxLineLength: number;
}

function isWithinSourceRoot(filePath: string, roots: string[]): boolean {
  try {
    const resolved = fs.realpathSync(path.resolve(filePath));
    return roots.some((root) => {
      const realRoot = fs.realpathSync(path.resolve(root));
      const relative = path.relative(realRoot, resolved);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
  } catch {
    return false;
  }
}

/** Read a bounded, explicitly allowed source excerpt. */
export function getCodeSnapshot(filePath: string, lineNumber: number, options: SnapshotOptions): string {
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || !filePath || !isWithinSourceRoot(filePath, options.sourceRoots)) {
    return '';
  }

  try {
    if (/^(?:file|data|webpack|vite|rollup):/i.test(filePath)) return '';
    const resolvedPath = path.resolve(filePath);
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile() || stat.size > options.maxBytes) return '';

    const lines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
    const start = Math.max(0, lineNumber - 3);
    const end = Math.min(lines.length - 1, lineNumber + 1);
    let output = '\n';

    for (let index = start; index <= end; index += 1) {
      const line = lines[index].slice(0, options.maxLineLength);
      const displayLineNumber = index + 1;
      const isTarget = displayLineNumber === lineNumber;
      const prefix = isTarget ? chalk.red(' > ') : '   ';
      const lineNumberLabel = chalk.gray(`${displayLineNumber.toString().padStart(3, ' ')} | `);
      output += `${prefix}${lineNumberLabel}${isTarget ? chalk.white(line) : chalk.dim(line)}\n`;
    }

    return output;
  } catch {
    return '';
  }
}
