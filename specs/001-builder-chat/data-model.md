# Data Model: Builder Chat Component

**Created**: 2025-12-25  
**Feature**: Builder Chat Component

## Entities

### ChatMessage

Represents a single message in the conversation.

**Attributes**:

- `id`: string (unique identifier for the message)
- `content`: string (message text content)
- `role`: 'user' | 'assistant' | 'error' (sender type)
- `timestamp`: Date (when the message was created/sent)
- `isStreaming`: boolean (whether the message is currently being streamed)
- `error`: string | null (error message if message represents an error state)

**State Transitions**:

1. **User Message**: Created with `role: 'user'`, `isStreaming: false`, `timestamp: now`
2. **Assistant Message (Streaming)**: Created with `role: 'assistant'`, `isStreaming: true`, content starts empty and accumulates
3. **Assistant Message (Complete)**: `isStreaming` transitions to `false` when streaming completes
4. **Error Message**: Created with `role: 'error'`, `isStreaming: false`, contains error message in `content` or `error` field

**Validation Rules**:

- `id` must be unique within conversation
- `content` cannot be empty for completed messages (except during streaming)
- `role` must be one of the specified values
- `timestamp` must be valid Date object
- `isStreaming` can only be `true` for `role: 'assistant'`
- Error messages must have non-empty `content` or `error` field

### Conversation

Represents a complete chat session containing multiple messages in chronological order.

**Attributes**:

- `messages`: ChatMessage[] (ordered array of messages, chronologically sorted)
- `isLoading`: boolean (whether a request is currently in progress)
- `error`: string | null (current error state, if any)

**State Management**:

- Messages maintained in chronological order (oldest to newest)
- New messages appended to end of array
- Messages immutable once completed (except for streaming assistant messages which update in place)
- Session-based only (not persisted to database)

**Operations**:

- `addMessage(message: ChatMessage)`: Add new message to conversation
- `updateStreamingMessage(id: string, content: string)`: Update content of streaming message
- `completeStreamingMessage(id: string)`: Mark streaming message as complete
- `addErrorMessage(error: string)`: Add error message to conversation
- `retryMessage(messageId: string)`: Retry failed message (removes error, resubmits)

## Relationships

- **Conversation contains Messages**: One-to-many relationship (1 Conversation : N ChatMessage)
- Messages have no relationships to other entities (session-based, no persistence)

## Data Flow

1. **User submits message**:
   - New ChatMessage created with `role: 'user'`, added to conversation
   - Message appears immediately in UI (FR-003)

2. **Streaming response starts**:
   - New ChatMessage created with `role: 'assistant'`, `isStreaming: true`, empty content
   - Message added to conversation
   - Streaming updates append to message content

3. **Streaming completes**:
   - Message `isStreaming` set to `false`
   - Message becomes immutable

4. **Error occurs**:
   - ChatMessage created with `role: 'error'`, error details in content
   - Message added to conversation
   - Retry functionality available (FR-011b)

## TypeScript Types

```typescript
type MessageRole = "user" | "assistant" | "error";

interface ChatMessage {
  id: string;
  content: string;
  role: MessageRole;
  timestamp: Date;
  isStreaming: boolean;
  error?: string | null;
}

interface Conversation {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}
```

## Notes

- No database persistence: All state is session-based and in-memory
- Message IDs: Generated client-side (UUID or timestamp-based)
- Timestamps: Client-side timestamps, not synchronized with server
- Streaming state: Managed by Vercel AI SDK's `useChat` hook in implementation
- Error handling: Errors represented as messages with `role: 'error'` for consistent UI treatment
