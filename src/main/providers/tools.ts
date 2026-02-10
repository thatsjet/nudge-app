import { NeutralToolDef } from './types';

export const VAULT_TOOLS: NeutralToolDef[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the vault. Use this to check tasks, ideas, config, daily logs, etc.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root (e.g., "tasks.md", "ideas/my-idea.md")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the vault.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Make a targeted edit to a file by replacing specific text. Use this for checking off tasks, updating status, etc.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        old_text: { type: 'string', description: 'The exact text to find and replace' },
        new_text: { type: 'string', description: 'The text to replace it with' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a vault directory.',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path relative to vault root (e.g., "ideas/", "daily/")' },
      },
      required: ['directory'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file in the vault. Fails if the file already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
  },
];
