import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** Append markdown to the GitHub job summary (no-op outside Actions). */
export function writeSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

/** Set a step output, using a heredoc delimiter so multi-line values are safe. */
export function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delimiter = `EOF_${randomUUID()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/** Emit a workflow annotation in Actions, plain stderr locally. */
export function annotate(level, message, { file, line } = {}) {
  if (process.env.GITHUB_ACTIONS) {
    const location = file ? ` file=${file}${line ? `,line=${line}` : ''}` : '';
    console.log(`::${level}${location}::${message.replace(/\r?\n/g, '%0A')}`);
  } else {
    console.error(`[${level}] ${file ? `${file}${line ? `:${line}` : ''} ` : ''}${message}`);
  }
}

export const mdEscape = (text) => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** @param {string[]} headers @param {Array<Array<string|number>>} rows */
export function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.map(mdEscape).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
