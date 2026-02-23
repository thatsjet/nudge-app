# Test Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Vitest with comprehensive unit tests for main process utilities and React component tests.

**Architecture:** Extract testable pure functions from `main.ts` into `src/main/utils.ts`, configure Vitest for both Node (main process) and jsdom (renderer) environments, write tests for all pure functions and key React components.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, jsdom

---

### Task 1: Install test dependencies

**Step 1: Install packages**

Run: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event`

**Step 2: Add test script to package.json**

Modify: `package.json` — add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest and testing-library dependencies"
```

---

### Task 2: Create Vitest config

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'jsdom'],
    ],
    css: false,
  },
});
```

**Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest configuration"
```

---

### Task 3: Extract utility functions from main.ts

The functions `truncate`, `summarizeForLog`, `formatError`, `resolveVaultPath`, and `processToolCall` are currently defined as private functions in `main.ts`. Extract the pure ones into `src/main/utils.ts` so they can be imported in tests.

**Files:**
- Create: `src/main/utils.ts`
- Modify: `src/main/main.ts` — import from `./utils` instead of inline definitions

**Step 1: Create `src/main/utils.ts`**

Extract these functions (copy verbatim from main.ts):
- `truncate(value: string, max?: number): string`
- `summarizeForLog(value: any, keyHint?: string, depth?: number): any`
- `formatError(error: any): Record<string, any>`

**Step 2: Update main.ts to import from utils**

Replace inline definitions with:
```ts
import { truncate, summarizeForLog, formatError } from './utils';
```

**Step 3: Verify main process compiles**

Run: `npx tsc -p tsconfig.electron.json`
Expected: Clean compilation, no errors

**Step 4: Commit**

```bash
git add src/main/utils.ts src/main/main.ts
git commit -m "refactor: extract utility functions to src/main/utils.ts"
```

---

### Task 4: Write tests for `truncate`

**Files:**
- Create: `src/main/utils.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { truncate } from './utils';

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
```

**Step 2: Run tests**

Run: `npx vitest run src/main/utils.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/main/utils.test.ts
git commit -m "test: add truncate utility tests"
```

---

### Task 5: Write tests for `summarizeForLog`

**Files:**
- Modify: `src/main/utils.test.ts`

**Step 1: Add tests**

```ts
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
```

**Step 2: Run tests**

Run: `npx vitest run src/main/utils.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/main/utils.test.ts
git commit -m "test: add summarizeForLog utility tests"
```

---

### Task 6: Write tests for `formatError`

**Files:**
- Modify: `src/main/utils.test.ts`

**Step 1: Add tests**

```ts
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
```

**Step 2: Run tests**

Run: `npx vitest run src/main/utils.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/main/utils.test.ts
git commit -m "test: add formatError utility tests"
```

---

### Task 7: Write tests for provider tool/message conversion

**Files:**
- Create: `src/main/providers/anthropic.test.ts`
- Create: `src/main/providers/openai.test.ts`

The conversion methods are private, so we test them indirectly through `buildToolResultMessages` and `getDefaultModels`, plus test the constructor behavior.

**Step 1: Write Anthropic provider tests**

```ts
import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from './anthropic';

describe('AnthropicProvider', () => {
  it('has correct id', () => {
    const provider = new AnthropicProvider();
    expect(provider.id).toBe('anthropic');
  });

  it('builds tool result messages in Anthropic format', () => {
    const provider = new AnthropicProvider();
    const rawAssistantMessage = [
      { type: 'text', text: 'Let me check that.' },
      { type: 'tool_use', id: 'tool_1', name: 'read_file', input: { path: 'tasks.md' } },
    ];
    const results = [{ toolCallId: 'tool_1', content: '# Tasks\n- Buy milk' }];

    const messages = provider.buildToolResultMessages(rawAssistantMessage, results);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toBe(rawAssistantMessage);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content[0].type).toBe('tool_result');
    expect(messages[1].content[0].tool_use_id).toBe('tool_1');
  });

  it('returns default models', () => {
    const provider = new AnthropicProvider();
    const models = provider.getDefaultModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].value).toBe('claude-sonnet-4-5');
    expect(models.every(m => m.value && m.label)).toBe(true);
  });

  it('throws when sendMessageStream called without configure', async () => {
    const provider = new AnthropicProvider();
    const { result } = provider.sendMessageStream({
      messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      systemPrompt: 'test',
      model: 'claude-sonnet-4-5',
      tools: [],
      onText: () => {},
    });
    await expect(result).rejects.toThrow('not configured');
  });
});
```

**Step 2: Write OpenAI provider tests**

```ts
import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from './openai';

describe('OpenAIProvider', () => {
  it('defaults to openai id', () => {
    const provider = new OpenAIProvider();
    expect(provider.id).toBe('openai');
  });

  it('accepts custom id', () => {
    const provider = new OpenAIProvider('custom');
    expect(provider.id).toBe('custom');
  });

  it('builds tool result messages in OpenAI format', () => {
    const provider = new OpenAIProvider();
    const rawAssistantMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"tasks.md"}' } }],
    };
    const results = [{ toolCallId: 'call_1', content: '# Tasks' }];

    const messages = provider.buildToolResultMessages(rawAssistantMessage, results);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(rawAssistantMessage);
    expect(messages[1].role).toBe('tool');
    expect(messages[1].tool_call_id).toBe('call_1');
    expect(messages[1].content).toBe('# Tasks');
  });

  it('returns correct default models for openai', () => {
    const provider = new OpenAIProvider('openai');
    const models = provider.getDefaultModels();
    expect(models.some(m => m.value === 'gpt-4o')).toBe(true);
    expect(models.some(m => m.value === 'gpt-4o-mini')).toBe(true);
  });

  it('returns correct default models for custom', () => {
    const provider = new OpenAIProvider('custom');
    const models = provider.getDefaultModels();
    expect(models).toHaveLength(1);
    expect(models[0].value).toBe('gpt-4o');
  });

  it('throws when sendMessageStream called without configure', async () => {
    const provider = new OpenAIProvider();
    const { result } = provider.sendMessageStream({
      messages: [{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }],
      systemPrompt: 'test',
      model: 'gpt-4o',
      tools: [],
      onText: () => {},
    });
    await expect(result).rejects.toThrow('not configured');
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/main/providers/`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/main/providers/anthropic.test.ts src/main/providers/openai.test.ts
git commit -m "test: add provider unit tests"
```

---

### Task 8: Write tests for VAULT_TOOLS definition

**Files:**
- Create: `src/main/providers/tools.test.ts`

**Step 1: Write tests**

```ts
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
```

**Step 2: Run tests**

Run: `npx vitest run src/main/providers/tools.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/main/providers/tools.test.ts
git commit -m "test: add VAULT_TOOLS definition tests"
```

---

### Task 9: Write tests for provider registry

**Files:**
- Create: `src/main/providers/registry.test.ts`

**Step 1: Write tests**

```ts
import { describe, it, expect } from 'vitest';
import { getProvider, resetProvider } from './registry';

describe('provider registry', () => {
  it('returns AnthropicProvider for "anthropic"', async () => {
    const provider = await getProvider('anthropic');
    expect(provider.id).toBe('anthropic');
  });

  it('returns OpenAIProvider for "openai"', async () => {
    const provider = await getProvider('openai');
    expect(provider.id).toBe('openai');
  });

  it('returns OpenAIProvider with custom id for "custom"', async () => {
    const provider = await getProvider('custom');
    expect(provider.id).toBe('custom');
  });

  it('caches provider instances', async () => {
    const p1 = await getProvider('anthropic');
    const p2 = await getProvider('anthropic');
    expect(p1).toBe(p2);
  });

  it('returns new instance after reset', async () => {
    const p1 = await getProvider('anthropic');
    resetProvider('anthropic');
    const p2 = await getProvider('anthropic');
    expect(p1).not.toBe(p2);
  });

  it('throws for unknown provider', async () => {
    await expect(getProvider('unknown' as any)).rejects.toThrow('Unknown provider');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/main/providers/registry.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/main/providers/registry.test.ts
git commit -m "test: add provider registry tests"
```

---

### Task 10: Write React component tests — Header

**Files:**
- Create: `src/renderer/components/Header.test.tsx`

**Step 1: Create test setup file**

Create: `src/renderer/test-setup.ts`
```ts
import '@testing-library/jest-dom/vitest';
```

Update `vitest.config.ts` to include:
```ts
setupFiles: ['./src/renderer/test-setup.ts'],
```

**Step 2: Write Header tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';

describe('Header', () => {
  const defaultProps = {
    onToggleExplorer: vi.fn(),
    onOpenSettings: vi.fn(),
    onNewChat: vi.fn(),
    explorerOpen: false,
  };

  it('renders the app title', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('Nudge')).toBeInTheDocument();
  });

  it('calls onNewChat when + button clicked', async () => {
    const onNewChat = vi.fn();
    render(<Header {...defaultProps} onNewChat={onNewChat} />);
    await userEvent.click(screen.getByTitle('New chat'));
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it('calls onOpenSettings when settings button clicked', async () => {
    const onOpenSettings = vi.fn();
    render(<Header {...defaultProps} onOpenSettings={onOpenSettings} />);
    await userEvent.click(screen.getByTitle('Settings'));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('calls onToggleExplorer when files button clicked', async () => {
    const onToggleExplorer = vi.fn();
    render(<Header {...defaultProps} onToggleExplorer={onToggleExplorer} />);
    await userEvent.click(screen.getByTitle('Toggle file explorer'));
    expect(onToggleExplorer).toHaveBeenCalledOnce();
  });

  it('shows active class when explorer is open', () => {
    render(<Header {...defaultProps} explorerOpen={true} />);
    const btn = screen.getByTitle('Toggle file explorer');
    expect(btn.className).toContain('header-btn--active');
  });

  it('shows update dot when hasUpdate is true', () => {
    const { container } = render(<Header {...defaultProps} hasUpdate={true} />);
    expect(container.querySelector('.header-update-dot')).toBeInTheDocument();
  });

  it('hides update dot when hasUpdate is false', () => {
    const { container } = render(<Header {...defaultProps} hasUpdate={false} />);
    expect(container.querySelector('.header-update-dot')).not.toBeInTheDocument();
  });
});
```

**Step 3: Run tests**

Run: `npx vitest run src/renderer/components/Header.test.tsx`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/renderer/test-setup.ts src/renderer/components/Header.test.tsx vitest.config.ts
git commit -m "test: add Header component tests"
```

---

### Task 11: Write React component tests — ChatInput

**Files:**
- Create: `src/renderer/components/ChatInput.test.tsx`

**Step 1: Write tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from './ChatInput';

describe('ChatInput', () => {
  it('renders textarea with placeholder', () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('disables textarea when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled={true} />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });

  it('calls onSend with trimmed value on Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'hello world{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('does not send on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} disabled={false} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'hello{Enter}');
    expect(textarea).toHaveValue('');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/renderer/components/ChatInput.test.tsx`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/renderer/components/ChatInput.test.tsx
git commit -m "test: add ChatInput component tests"
```

---

### Task 12: Write React component tests — ChatPanel

**Files:**
- Create: `src/renderer/components/ChatPanel.test.tsx`

**Step 1: Write tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from './ChatPanel';
import { ChatMessage } from '../../shared/types';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: '1',
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides,
});

describe('ChatPanel', () => {
  const defaultProps = {
    messages: [] as ChatMessage[],
    isStreaming: false,
    streamingContent: '',
    onSendMessage: vi.fn(),
  };

  it('shows empty state with suggestion chips when no messages', () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByText('What would you like to work on?')).toBeInTheDocument();
    expect(screen.getByText('Start my day')).toBeInTheDocument();
    expect(screen.getByText('I have an idea')).toBeInTheDocument();
  });

  it('sends suggestion chip text on click', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);
    await user.click(screen.getByText('Start my day'));
    expect(onSendMessage).toHaveBeenCalledWith('Start my day');
  });

  it('renders messages when provided', () => {
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'Hi there' }),
      makeMessage({ id: '2', role: 'assistant', content: 'Hello!' }),
    ];
    render(<ChatPanel {...defaultProps} messages={messages} />);
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows typing indicator when streaming with no content', () => {
    const { container } = render(
      <ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="" />
    );
    expect(container.querySelector('.chat-panel-typing')).toBeInTheDocument();
  });

  it('shows streaming content when available', () => {
    render(
      <ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="Thinking about..." />
    );
    expect(screen.getByText('Thinking about...')).toBeInTheDocument();
  });

  it('disables input while streaming', () => {
    render(<ChatPanel {...defaultProps} messages={[makeMessage()]} isStreaming={true} streamingContent="" />);
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/renderer/components/ChatPanel.test.tsx`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/renderer/components/ChatPanel.test.tsx
git commit -m "test: add ChatPanel component tests"
```

---

### Task 13: Write React component tests — MessageBubble

**Files:**
- Create: `src/renderer/components/MessageBubble.test.tsx`

**Step 1: Write tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { ChatMessage } from '../../shared/types';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: '1',
  role: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
});

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={makeMessage({ content: 'Hello world' })} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('applies user class for user messages', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'user' })} />);
    expect(container.querySelector('.message-bubble--user')).toBeInTheDocument();
  });

  it('applies assistant class for assistant messages', () => {
    const { container } = render(<MessageBubble message={makeMessage({ role: 'assistant' })} />);
    expect(container.querySelector('.message-bubble--assistant')).toBeInTheDocument();
  });

  it('displays formatted timestamp', () => {
    const timestamp = new Date('2026-02-22T14:30:00').getTime();
    render(<MessageBubble message={makeMessage({ timestamp })} />);
    expect(screen.getByText(/2:30/)).toBeInTheDocument();
  });

  it('renders markdown content', () => {
    render(<MessageBubble message={makeMessage({ content: '**bold text**' })} />);
    const strong = screen.getByText('bold text');
    expect(strong.tagName).toBe('STRONG');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/renderer/components/MessageBubble.test.tsx`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/renderer/components/MessageBubble.test.tsx
git commit -m "test: add MessageBubble component tests"
```

---

### Task 14: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, 0 failures

**Step 2: Verify TypeScript compilation still works**

Run: `npx tsc -p tsconfig.electron.json`
Expected: Clean compilation

**Step 3: Final commit if any remaining changes**

```bash
git add -A
git commit -m "test: complete test infrastructure setup"
```
