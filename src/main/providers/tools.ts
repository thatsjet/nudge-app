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
  {
    name: 'move_file',
    description: 'Move a file from one location to another within the vault. Use this to archive completed idea files by moving them from ideas/ to archive/.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file path relative to vault root (e.g., "ideas/my-idea.md")' },
        destination: { type: 'string', description: 'Destination file path relative to vault root (e.g., "archive/my-idea.md")' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'archive_tasks',
    description: 'Archive completed tasks from the Today section of tasks.md. Moves all "- [x]" tasks from the Today section to archive/archived_tasks.md with a date header, and removes them from tasks.md. Recurring sections (Recurring Daily, Recurring Weekly) are left untouched. Call this when the user asks to clean up completed tasks or during end-of-day.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The date to use for the archive header in YYYY-MM-DD format (e.g., "2026-02-17")' },
      },
      required: ['date'],
    },
  },
  {
    name: 'update_nudge_settings',
    description: 'Update nudge notification settings. Use when the user wants to change nudge times, enable/disable nudges, or toggle Do Not Disturb. Partial updates — only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        morning_enabled: { type: 'string', description: 'Set morning nudge enabled: "true" or "false"' },
        morning_time: { type: 'string', description: 'Set morning nudge time in HH:MM 24-hour format (e.g., "09:00") or "+N" for N minutes from now (e.g., "+5")' },
        midday_enabled: { type: 'string', description: 'Set mid-day nudge enabled: "true" or "false"' },
        midday_time: { type: 'string', description: 'Set mid-day nudge time in HH:MM 24-hour format (e.g., "11:00") or "+N" for N minutes from now (e.g., "+5")' },
        endOfDay_enabled: { type: 'string', description: 'Set end-of-day nudge enabled: "true" or "false"' },
        endOfDay_time: { type: 'string', description: 'Set end-of-day nudge time in HH:MM 24-hour format (e.g., "15:00") or "+N" for N minutes from now (e.g., "+5")' },
        doNotDisturb: { type: 'string', description: 'Set Do Not Disturb: "true" or "false". When enabled, suppresses all nudges until auto-reset at end-of-day time.' },
      },
      required: [],
    },
  },
];
