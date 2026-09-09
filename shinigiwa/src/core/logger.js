const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code, s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);

export const c = {
  dim: (s) => paint('2', s),
  bold: (s) => paint('1', s),
  red: (s) => paint('31', s),
  green: (s) => paint('32', s),
  yellow: (s) => paint('33', s),
  blue: (s) => paint('34', s),
  magenta: (s) => paint('35', s),
  cyan: (s) => paint('36', s),
};

export const log = {
  info: (...a) => console.log(...a),
  step: (...a) => console.log(c.cyan('›'), ...a),
  ok: (...a) => console.log(c.green('✓'), ...a),
  warn: (...a) => console.log(c.yellow('!'), ...a),
  error: (...a) => console.error(c.red('✗'), ...a),
  blank: () => console.log(''),
  rule: (title = '') =>
    console.log(c.dim('─'.repeat(6) + (title ? ` ${title} ` : '') + '─'.repeat(Math.max(0, 60 - title.length)))),
};

export class UserError extends Error {}
