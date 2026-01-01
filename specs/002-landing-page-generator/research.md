# Research: Landing Page Code Generation Tool

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool  
**Purpose**: Resolve technical decisions and clarify implementation approach

## Technology Decisions

### Vercel AI SDK Function Calling

**Decision**: Use Vercel AI SDK's function calling (tools) feature to integrate code generation tool with chat

**Rationale**:

- Vercel AI SDK (`ai` package v6+) supports function calling via `tools` parameter in `streamText`
- Provides standardized interface for tool invocation from chat
- Handles tool execution flow automatically (detects when to call tool, executes, returns results)
- Integrates seamlessly with existing chat infrastructure
- Type-safe API with TypeScript support
- Supports streaming responses even when tools are involved

**Alternatives considered**:

- Custom tool invocation system: More complex, requires custom parsing and execution logic
- Separate API endpoint for code generation: Breaks chat flow, requires manual orchestration
- Direct LLM calls without tools: Less structured, harder to manage tool lifecycle

**Implementation pattern**:

- Define code generation tool using `tool()` helper from `ai` package
- Add tool to `tools` array in `streamText()` call in `app/api/chat/route.ts`
- Tool function receives user request, calls AI service for code generation
- Tool returns structured result that gets included in chat response
- Chat system automatically handles tool invocation and result display

### Code Generation AI Service

**Decision**: Use same AI model provider (OpenAI) configured in chat system for code generation

**Rationale**:

- Leverages existing AI_MODEL_PROVIDER and AI_MODEL_NAME environment variables
- Consistent model behavior across chat and code generation
- No additional API keys or configuration needed
- Can use same model or specialized code model (e.g., GPT-4 for code generation)

**Alternatives considered**:

- Separate AI service: Additional configuration, potential inconsistency
- Different model provider: Requires new API keys, different prompt patterns
- Local code generation: Not feasible for HTML/Tailwind generation quality

**Implementation pattern**:

- Use `getAIModel()` function pattern from existing chat route
- Create specialized prompt for code generation (HTML + Tailwind CSS)
- Include conversation context and previous code versions for iterative refinement
- Handle streaming or non-streaming responses based on model capabilities

### HTML Code Validation and Error Fixing

**Decision**: Use HTML parser library (e.g., `node-html-parser` or `jsdom`) for validation and basic error fixing

**Rationale**:

- HTML parsers can detect malformed HTML (unclosed tags, invalid structure)
- Can automatically fix common errors (close unclosed tags, fix nesting)
- Lightweight and fast validation before database save
- Reduces need for manual fixes by users
- Catches errors before preview panel rendering issues

**Alternatives considered**:

- No validation: Higher error rate, poor user experience
- Full HTML validator: Overkill, may reject valid Tailwind patterns
- Browser-based validation: Requires headless browser, slower, more complex
- Manual error detection: Not scalable, misses edge cases

**Implementation pattern**:

- Parse generated HTML using HTML parser library
- Detect common errors: unclosed tags, invalid nesting, malformed attributes
- Apply automatic fixes: close tags, fix nesting, validate structure
- Log fixes applied for debugging
- If unfixable errors detected, show warning but still save (let preview handle)

### Database Schema for Landing Pages

**Decision**: Add `landing_page_versions` table to existing PostgreSQL schema using Drizzle ORM

**Rationale**:

- Follows existing database pattern (users, teams, etc.)
- Drizzle ORM already configured and in use
- PostgreSQL supports text storage for HTML code (up to 1MB per spec)
- Sequential versioning per session can be implemented with auto-increment
- User and session association via foreign keys

**Alternatives considered**:

- Separate database: Unnecessary complexity, harder to maintain
- File storage: Less queryable, harder to version, more complex
- NoSQL database: Doesn't match existing stack, adds complexity

**Implementation pattern**:

- Create `landing_page_versions` table with: id, user_id, session_id, version_number, code_content, created_at
- Use Drizzle schema definition in `lib/db/schema.ts`
- Add queries in `lib/db/queries.ts` for CRUD operations
- Version number auto-increments per session (v1, v2, v3...)
- Most recent version identified by MAX(version_number) per session

### Request Queue Management

**Decision**: Implement simple in-memory queue per user session for sequential request processing

**Rationale**:

- Prevents concurrent code generation requests from same user
- Simple to implement with Promise-based queue
- No external queue infrastructure needed
- Aligns with spec requirement (FR-019)
- Queue cleared when request completes or errors

**Alternatives considered**:

- External queue service (Redis, Bull): Overkill for single-user sequential processing
- Database-based queue: More complex, slower, unnecessary
- Allow concurrent requests: Violates spec, potential race conditions

**Implementation pattern**:

- Maintain queue state in API route handler (per user session)
- When request arrives, check if generation in progress
- If in progress, queue request and return immediately with "queued" status
- Process queue sequentially, one request at a time
- Clear queue on completion or error

### Preview Panel Communication

**Decision**: Use existing postMessage protocol (assumed to exist per spec) for preview updates

**Rationale**:

- Spec assumes preview panel infrastructure exists
- postMessage is standard for parent-iframe communication
- No new communication protocol needed
- Preview panel can listen for update messages

**Alternatives considered**:

- WebSocket: Overkill for one-way updates, adds complexity
- Polling: Inefficient, adds latency
- Custom protocol: Unnecessary if postMessage exists

**Implementation pattern**:

- After successful code save, send postMessage to preview iframe
- Message includes: action type ("update"), version ID, preview URL
- Preview panel receives message and updates iframe src or content
- Handle postMessage errors gracefully (log, don't block save)

### Error Recovery and Retry Logic

**Decision**: Keep generated code in memory (Map/object) temporarily when save fails, provide retry UI in chat

**Rationale**:

- Prevents data loss when generation succeeds but save fails
- User can retry save without regenerating code
- Simple in-memory storage sufficient for temporary holding
- Retry button in chat provides clear user action
- Code cleared after successful save or user cancellation

**Alternatives considered**:

- Discard code on save failure: Poor UX, wastes generation time
- Auto-retry save: May retry indefinitely, hides errors from user
- Save to temporary storage: More complex, requires cleanup logic

**Implementation pattern**:

- Store generated code in Map keyed by request ID or user session
- On save failure, keep code in memory, show error with retry button
- Retry button triggers save operation again with stored code
- Clear memory after successful save or explicit cancellation
- Set timeout for memory cleanup (e.g., 1 hour)

## Architecture Decisions

### Tool Invocation Flow

**Decision**: Code generation tool invoked automatically when chat detects landing page creation request

**Rationale**:

- Seamless user experience (no explicit tool selection needed)
- AI model determines when to invoke tool based on user intent
- Matches spec requirement (FR-001: tool invoked when users request landing page creation)
- Natural conversation flow maintained

**Implementation pattern**:

- Tool definition includes description: "Generate HTML code with Tailwind CSS for landing pages"
- AI model analyzes user message and decides to invoke tool
- Tool receives user request text and conversation context
- Tool executes code generation, returns result
- Result formatted and displayed in chat

### Code Generation Prompt Strategy

**Decision**: Use structured prompt with examples, Tailwind CSS guidelines, and conversation context

**Rationale**:

- Structured prompts improve code quality and consistency
- Include Tailwind CSS best practices in prompt
- Conversation context enables iterative refinement
- Examples help model understand desired output format

**Implementation pattern**:

- Build prompt with: user request, conversation history, previous code versions (if iterating)
- Include Tailwind CSS class examples and patterns
- Specify HTML structure requirements (semantic HTML, accessibility)
- Request complete, valid HTML document (not fragments)
- Include error handling instructions in prompt

### Version History Management

**Decision**: Auto-increment version numbers per session, track in database with foreign key to user

**Rationale**:

- Sequential versioning (v1, v2, v3) matches spec clarification
- Database tracking enables version history queries
- User association enables multi-user support
- Session association enables multiple concurrent sessions per user

**Implementation pattern**:

- Generate version number: MAX(version_number) + 1 per session
- Store version number, code content, timestamp in database
- Query most recent version: WHERE session_id = X ORDER BY version_number DESC LIMIT 1
- Version numbers reset per new session (session_id changes)

## Performance Considerations

### Code Generation Latency

- Target: <30 seconds per spec (SC-001)
- Optimize prompt length (include only relevant context)
- Use appropriate model (faster model if acceptable quality)
- Consider caching common patterns if applicable

### Database Save Performance

- Batch operations if multiple saves needed
- Use transactions for atomic operations
- Index on (session_id, version_number) for fast queries
- Consider async save if preview doesn't require immediate persistence

### Memory Management

- Clear temporary code storage after timeout
- Limit queue size to prevent memory issues
- Monitor memory usage for large code outputs (up to 1MB per spec)

## Dependencies to Add

- `node-html-parser` or `jsdom` - HTML parsing and validation
- No new dependencies for Vercel AI SDK (already have `ai` package)
- No new dependencies for database (already have `drizzle-orm`)

## Security Considerations

- Validate generated code before saving (prevent XSS in preview)
- Sanitize user input in prompts (prevent prompt injection)
- Rate limit code generation requests (prevent abuse)
- Authenticate all tool invocations (existing auth middleware)
- Validate code size limits (prevent DoS via large code)
