# API Contract: Chat Streaming Endpoint

**Created**: 2025-12-25  
**Feature**: Builder Chat Component  
**Endpoint**: `POST /api/chat`

## Overview

This endpoint handles chat message submission and streams AI responses back to the client using Server-Sent Events (SSE).

## Request

### HTTP Method

`POST`

### Path

`/api/chat`

### Headers

```
Content-Type: application/json
Cookie: <session cookie> (for authentication)
```

### Request Body

```typescript
{
  message: string;        // User's message content
  messages?: Array<{      // Optional: conversation history for context
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

### Example Request

```json
{
  "message": "Create a landing page for a coffee shop",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you build your website?"
    }
  ]
}
```

## Response

### Streaming Response (Success)

**Status Code**: `200 OK`

**Headers**:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Response Format**: Server-Sent Events (SSE) stream

**Event Types**:

1. **Text Delta Events**: Streamed content chunks

   ```
   event: text
   data: {"type":"text","content":"partial content"}
   ```

2. **Completion Event**: Stream completion
   ```
   event: done
   data: {}
   ```

### Error Response

**Status Code**: `400 Bad Request` | `401 Unauthorized` | `500 Internal Server Error`

**Headers**:

```
Content-Type: application/json
```

**Response Body**:

```typescript
{
  error: string;          // Human-readable error message
  code?: string;          // Optional error code
}
```

**Example Error Response**:

```json
{
  "error": "Failed to connect to AI service",
  "code": "AI_SERVICE_ERROR"
}
```

## Authentication

- Requires valid user session (cookie-based authentication)
- Uses existing session middleware
- Returns `401 Unauthorized` if session is invalid or missing

## Error Codes

| Code                  | HTTP Status | Description                                       |
| --------------------- | ----------- | ------------------------------------------------- |
| `UNAUTHORIZED`        | 401         | User not authenticated                            |
| `INVALID_MESSAGE`     | 400         | Message content is empty or invalid               |
| `AI_SERVICE_ERROR`    | 500         | Error connecting to or processing with AI service |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests (if rate limiting implemented)  |
| `STREAMING_ERROR`     | 500         | Error during streaming (connection lost, etc.)    |

## Implementation Notes

- Uses Vercel AI SDK's `streamText` function for LLM streaming
- Response streams using Server-Sent Events (SSE)
- Client uses `useChat` hook from Vercel AI SDK to consume stream
- Streaming can be interrupted by client disconnect
- No message persistence (session-based only per spec)

## Integration with Client

The client uses Vercel AI SDK's `useChat` hook:

```typescript
const { messages, input, handleSubmit, isLoading, error } = useChat({
  api: "/api/chat",
  onError: (error) => {
    // Handle error
  },
});
```

The hook handles:

- Sending POST requests to `/api/chat`
- Parsing SSE stream
- Updating messages state
- Managing loading and error states
