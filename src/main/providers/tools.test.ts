import { describe, it, expect } from 'vitest';
import { VAULT_TOOLS } from './tools';

describe('VAULT_TOOLS', () => {
  it('exports 7 tools', () => {
    expect(VAULT_TOOLS).toHaveLength(7);
  });

  it('all tools have required fields', () => {
    for (const tool of VAULT_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    }
  });

  it('includes expected tool names', () => {
    const names = VAULT_TOOLS.map(t => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('list_files');
    expect(names).toContain('create_file');
    expect(names).toContain('move_file');
    expect(names).toContain('archive_tasks');
  });

  it('all required params exist in properties', () => {
    for (const tool of VAULT_TOOLS) {
      for (const req of tool.parameters.required) {
        expect(tool.parameters.properties).toHaveProperty(req);
      }
    }
  });
});
