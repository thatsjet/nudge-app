import { describe, it, expect } from 'vitest';
import { truncate, summarizeForLog, formatError } from './utils';

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello')).toBe('hello');
  });

  it('truncates strings exceeding default max (220)', () => {
    const long = 'a'.repeat(300);
    const result = truncate(long);
    expect(result).toBe('a'.repeat(220) + '... [len=300]');
  });

  it('respects custom max length', () => {
    const result = truncate('abcdefgh', 5);
    expect(result).toBe('abcde... [len=8]');
  });

  it('returns string at exact max length unchanged', () => {
    const exact = 'a'.repeat(220);
    expect(truncate(exact)).toBe(exact);
  });
});

describe('summarizeForLog', () => {
  it('returns null/undefined as-is', () => {
    expect(summarizeForLog(null)).toBe(null);
    expect(summarizeForLog(undefined)).toBe(undefined);
  });

  it('returns numbers and booleans as-is', () => {
    expect(summarizeForLog(42)).toBe(42);
    expect(summarizeForLog(true)).toBe(true);
  });

  it('redacts API key fields', () => {
    expect(summarizeForLog('sk-secret-key', 'api_key')).toBe('<redacted len=13>');
    expect(summarizeForLog('secret', 'apiKey')).toBe('<redacted len=6>');
    expect(summarizeForLog('secret', 'token')).toBe('<redacted len=6>');
    expect(summarizeForLog('secret', 'password')).toBe('<redacted len=6>');
    expect(summarizeForLog('secret', 'authorization')).toBe('<redacted len=6>');
  });

  it('summarizes systemPrompt and content fields', () => {
    expect(summarizeForLog('long prompt text', 'systemPrompt')).toBe('<systemPrompt len=16>');
    expect(summarizeForLog('message body', 'content')).toBe('<content len=12>');
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(300);
    const result = summarizeForLog(long);
    expect(result).toContain('... [len=300]');
  });

  it('handles arrays with max 10 items', () => {
    const arr = Array.from({ length: 15 }, (_, i) => i);
    const result = summarizeForLog(arr);
    expect(result).toHaveLength(11); // 10 items + overflow marker
    expect(result[10]).toBe('[+5 more]');
  });

  it('recursively summarizes objects', () => {
    const obj = { apiKey: 'secret', name: 'test' };
    const result = summarizeForLog(obj);
    expect(result.apiKey).toBe('<redacted len=6>');
    expect(result.name).toBe('test');
  });

  it('stops at depth limit', () => {
    expect(summarizeForLog('anything', '', 4)).toBe('[depth-limit]');
  });
});

describe('formatError', () => {
  it('extracts standard error properties', () => {
    const error = new Error('something broke');
    error.name = 'TypeError';
    const result = formatError(error);
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('something broke');
    expect(result.stack).toBeDefined();
  });

  it('handles non-Error values', () => {
    expect(formatError('string error').message).toBe('string error');
    expect(formatError(null).message).toBe('null');
    expect(formatError(undefined).message).toBe('undefined');
  });

  it('includes code and status if present', () => {
    const error = { message: 'fail', code: 'ENOENT', status: 404, type: 'not_found' };
    const result = formatError(error);
    expect(result.code).toBe('ENOENT');
    expect(result.status).toBe(404);
    expect(result.type).toBe('not_found');
  });

  it('truncates long stack traces', () => {
    const error = new Error('x');
    error.stack = 'x'.repeat(1000);
    const result = formatError(error);
    expect(result.stack.length).toBeLessThan(600);
    expect(result.stack).toContain('... [len=1000]');
  });
});
