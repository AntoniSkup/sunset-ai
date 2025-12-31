# Quickstart: Builder Chat Component

**Created**: 2025-12-25  
**Feature**: Builder Chat Component

## Overview

This guide provides a quick reference for implementing and using the Builder Chat Component. The component enables users to interact with an AI assistant via natural language to build websites, with real-time streaming responses and efficient message history management.

## Architecture Summary

- **Frontend**: React component using Vercel AI SDK's `useChat` hook
- **Backend**: Next.js API route (`/api/chat`) using Vercel AI SDK's `streamText`
- **State Management**: Vercel AI SDK hook manages messages, streaming, errors
- **Performance**: Virtualized message list using `@tanstack/react-virtual`
- **Rendering**: Markdown support via `@ai-sdk/ui` or `react-markdown`

## Key Components

### 1. Chat Component (`components/chat/chat.tsx`)

Main chat interface component that:

- Renders virtualized message list
- Displays input field (disabled during streaming)
- Shows welcome message when empty
- Handles error display and retry

### 2. API Route (`app/api/chat/route.ts`)

Server-side endpoint that:

- Authenticates user session
- Processes chat messages
- Streams AI responses via SSE
- Handles errors gracefully

### 3. Message List (`components/chat/message-list.tsx`)

Virtualized list component that:

- Renders only visible messages
- Maintains scroll position
- Handles streaming updates
- Supports 200+ messages efficiently

## Implementation Steps

### Step 1: Install Dependencies

```bash
npm install ai @tanstack/react-virtual react-markdown
# or
pnpm add ai @tanstack/react-virtual react-markdown
```

### Step 2: Create API Route

Create `app/api/chat/route.ts`:

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { message, messages } = await req.json();

  const result = streamText({
    model: openai("gpt-5.2"),
    messages: [...messages, { role: "user", content: message }],
  });

  return result.toDataStreamResponse();
}
```

### Step 3: Create Chat Component

Create `components/chat/chat.tsx`:

```typescript
'use client';

import { useChat } from 'ai/react';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { WelcomeMessage } from './welcome-message';

export function Chat() {
  const { messages, input, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
  });

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 ? (
        <WelcomeMessage />
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput
        input={input}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
}
```

### Step 4: Implement Virtualized Message List

Use `@tanstack/react-virtual` to virtualize the message list for performance.

### Step 5: Add Error Handling

Implement error messages as chat messages with retry functionality.

## Usage Example

```typescript
import { Chat } from '@/components/chat/chat';

export default function BuilderPage() {
  return (
    <div className="grid grid-cols-2 h-screen">
      <div className="border-r">
        <Chat />
      </div>
      <div>
        {/* Preview panel */}
      </div>
    </div>
  );
}
```

## Key Behaviors

### Input Blocking

- Input field is disabled when `isLoading` is `true`
- Prevents new messages during active streaming
- Visual indication (disabled state) shown to user

### Error Handling

- Errors displayed as messages in chat history
- Retry button available on error messages
- No automatic retry (manual only)

### Empty State

- Welcome message shown when no messages exist
- Includes example prompts or instructions
- Helps users understand how to use the chat

### Streaming

- Responses stream in real-time
- Content appears token-by-token
- Scroll position maintained (unless user at bottom)
- Smooth updates without page refresh

## Performance Targets

- Message display: <100ms
- Streaming start: <1s
- Scrolling: 60 FPS with 200+ messages
- Success rate: 95% of messages complete without errors

## Testing Checklist

- [ ] Component renders correctly
- [ ] Messages display in chronological order
- [ ] Streaming responses work smoothly
- [ ] Input disabled during streaming
- [ ] Error messages display with retry
- [ ] Welcome message shows when empty
- [ ] Virtualization works with 200+ messages
- [ ] Scroll position maintained during streaming
- [ ] Performance targets met

## Next Steps

1. Implement individual components (message-item, chat-input, etc.)
2. Add markdown rendering for message content
3. Implement virtualization for message list
4. Add error handling and retry logic
5. Style components with Tailwind CSS
6. Test with real AI API integration
