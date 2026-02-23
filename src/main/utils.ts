export function truncate(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... [len=${value.length}]`;
}

export function summarizeForLog(value: any, keyHint = '', depth = 0): any {
  if (depth > 3) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (/(^|[-_])(api[-_]?key|key|token|password|authorization)($|[-_])/i.test(keyHint)) {
      return `<redacted len=${value.length}>`;
    }
    if (keyHint === 'systemPrompt') return `<systemPrompt len=${value.length}>`;
    if (keyHint === 'content') return `<content len=${value.length}>`;
    return truncate(value);
  }

  if (Array.isArray(value)) {
    const maxItems = 10;
    const mapped = value.slice(0, maxItems).map((item) => summarizeForLog(item, '', depth + 1));
    if (value.length > maxItems) mapped.push(`[+${value.length - maxItems} more]`);
    return mapped;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = summarizeForLog(v, k, depth + 1);
    }
    return out;
  }

  return String(value);
}

export function formatError(error: any): Record<string, any> {
  return {
    name: error?.name,
    message: error?.message || String(error),
    code: error?.code,
    status: error?.status,
    type: error?.type,
    stack: error?.stack ? truncate(error.stack, 500) : undefined,
  };
}
