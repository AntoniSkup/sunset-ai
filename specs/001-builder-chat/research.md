# Research: Builder Chat Component

**Created**: 2025-12-25  
**Feature**: Builder Chat Component  
**Purpose**: Resolve technical decisions and clarify implementation approach

## Technology Decisions

### Vercel AI SDK Integration

**Decision**: Use Vercel AI SDK (`ai` package) for streaming LLM responses

**Rationale**:

- Provides standardized streaming interface with React hooks (`useChat`, `useCompletion`)
- Handles Server-Sent Events (SSE) streaming automatically
- Integrates seamlessly with Next.js App Router
- Supports multiple LLM providers (OpenAI, Anthropic, etc.)
- Built-in error handling and retry logic
- Type-safe API with TypeScript support

**Alternatives considered**:

- Direct fetch API with manual SSE parsing: More complex, requires custom error handling
- OpenAI SDK directly: Less flexible, provider-specific
- Custom streaming implementation: Unnecessary complexity, reinventing the wheel

**Implementation pattern**:

- Use `useChat` hook for chat interface with streaming
- Create API route handler at `app/api/chat/route.ts` using `streamText` or similar
- Hook provides `messages`, `input`, `handleSubmit`, `isLoading`, `error` states
- Messages automatically managed by hook, updates via streaming

### Vercel Streamdown for Message Rendering

**Decision**: Use `@ai-sdk/ui` or similar for message rendering with markdown support

**Rationale**:

- Note: "streamdown" may refer to markdown streaming rendering
- Vercel AI SDK provides `@ai-sdk/ui` package with pre-built message components
- Handles markdown rendering, code blocks, and streaming updates
- Integrates with AI SDK hooks automatically
- Provides consistent styling and formatting

**Alternatives considered**:

- Custom markdown renderer: More development time, potential bugs
- React Markdown: Would need custom streaming integration
- Plain text only: Loses formatting capabilities, poorer UX

**Implementation pattern**:

- Use `@ai-sdk/ui` components for message rendering if available
- Or use `react-markdown` with streaming support for markdown content
- Ensure code blocks and formatting are properly rendered
- Handle streaming updates to markdown content smoothly

### React Virtualization for Message List

**Decision**: Use `@tanstack/react-virtual` (formerly react-virtual) for message list virtualization

**Rationale**:

- Lightweight and performant virtualization library
- Works well with dynamic content and streaming updates
- Supports smooth scrolling and maintains scroll position
- Active development and good TypeScript support
- Easy integration with React hooks
- Handles variable-height items (different message lengths)

**Alternatives considered**:

- `react-window`: Less flexible for variable heights, older API
- `react-virtualized`: Larger bundle size, less actively maintained
- Custom virtualization: Complex to implement correctly, high risk
- No virtualization: Performance degradation with 200+ messages violates success criteria

**Implementation pattern**:

- Use `useVirtualizer` hook from `@tanstack/react-virtual`
- Virtualize message list container
- Handle dynamic height calculations for messages
- Preserve scroll position during streaming updates (unless user at bottom)
- Ensure smooth scrolling performance (60 FPS target)

### Testing Approach

**Decision**: Use React Testing Library with Vitest for component testing, manual testing for streaming behavior

**Rationale**:

- React Testing Library aligns with React best practices (testing user behavior)
- Vitest is fast and compatible with Next.js/TypeScript
- Streaming behavior requires integration testing with real API
- Visual regression testing may be needed for message rendering
- Performance testing needed for virtualization with 200+ messages

**Alternatives considered**:

- Jest: Slower, larger configuration overhead
- Cypress/Playwright: Overkill for unit/component tests, better for E2E
- Manual testing only: Insufficient coverage, regression risk

**Implementation pattern**:

- Unit tests for utility functions and message state management
- Component tests for individual chat components (input, message item, etc.)
- Integration tests for chat flow with mocked streaming responses
- Manual testing for real streaming behavior and performance
- Performance benchmarks for virtualization with large message lists

### API Route Structure

**Decision**: Create API route at `app/api/chat/route.ts` using Next.js App Router Route Handlers

**Rationale**:

- Follows existing API route pattern in project (`app/api/user/route.ts`, `app/api/team/route.ts`)
- Next.js Route Handlers support streaming responses via Response.stream()
- Can integrate Vercel AI SDK's `streamText` for LLM streaming
- Server-side execution, secure API key handling
- Compatible with existing authentication middleware

**Alternatives considered**:

- Server Actions: Less suitable for streaming, better for form submissions
- External API service: Unnecessary complexity, adds latency
- Client-side only: Security concerns (API keys exposed), violates architecture

**Implementation pattern**:

- Export `POST` handler in `app/api/chat/route.ts`
- Use Vercel AI SDK's `streamText` to stream LLM responses
- Handle authentication via existing session middleware
- Return streaming Response compatible with `useChat` hook
- Error handling with appropriate status codes

## Architecture Decisions

### State Management

**Decision**: Use Vercel AI SDK's `useChat` hook for primary state management, local React state for UI concerns

**Rationale**:

- `useChat` manages messages, input, loading, error states automatically
- Reduces boilerplate and potential bugs
- Integrates seamlessly with streaming
- Additional UI state (scroll position, input focus) can use `useState`

**Alternatives considered**:

- Redux/Zustand: Unnecessary complexity for chat component scope
- Context API: `useChat` already provides needed state
- Full custom state: More code, higher bug risk

### Error Handling Strategy

**Decision**: Display errors as messages in chat history with retry button (per spec FR-011a, FR-011b)

**Rationale**:

- Errors are part of conversation context
- Users can retry failed operations easily
- Clear visual feedback for error states
- Maintains conversation flow

**Implementation pattern**:

- Error messages added to messages array with type: 'error'
- Retry button triggers resubmission of failed message
- Network errors shown immediately, streaming errors captured on failure
- No auto-retry (per spec clarification)

### Streaming Input Blocking

**Decision**: Disable input field during active streaming (per spec FR-012)

**Rationale**:

- Prevents user confusion from multiple concurrent streams
- Ensures conversation coherence (one response at a time)
- Simplifies state management
- Better UX than queuing or canceling

**Implementation pattern**:

- Use `isLoading` state from `useChat` hook to disable input
- Visual indication (disabled state, loading indicator) when streaming
- Input re-enabled when streaming completes or errors

## Performance Considerations

### Virtualization Strategy

- Render only visible messages plus small buffer above/below viewport
- Measure message heights dynamically (variable height content)
- Maintain scroll position calculations during streaming updates
- Optimize re-renders by memoizing message components

### Streaming Performance

- Throttle rendering updates if needed (but aim for smooth updates)
- Use React's automatic batching for state updates
- Minimize DOM manipulations during streaming

## Dependencies to Add

- `ai` - Vercel AI SDK
- `@ai-sdk/ui` - UI components for AI SDK (if available, or use react-markdown)
- `@tanstack/react-virtual` - Virtualization library
- `react-markdown` - Markdown rendering (if not using @ai-sdk/ui)
- `vitest` - Testing framework (if not already present)
- `@testing-library/react` - React component testing
