# API Contract: Code Generation Tool

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool  
**Type**: Vercel AI SDK Tool/Function

## Overview

The code generation tool is integrated into the chat API route (`app/api/chat/route.ts`) as a Vercel AI SDK tool. It is invoked automatically by the AI model when it detects a user request for landing page creation or modification.

## Tool Definition

### Tool Name

`generate_landing_page_code`

### Tool Description

Generates HTML code with Tailwind CSS styling for landing pages based on user's natural language description. Can create new landing pages or modify existing ones based on conversation context.

### Tool Schema

```typescript
import { tool } from "ai";

const generateLandingPageCodeTool = tool({
  description:
    "Generate HTML code with Tailwind CSS for landing pages. Use this when users request to create, build, or modify a landing page. Include conversation context and previous code versions for iterative refinement.",
  parameters: z.object({
    userRequest: z
      .string()
      .describe(
        "The user's natural language request describing the landing page they want to create or modify"
      ),
    isModification: z
      .boolean()
      .optional()
      .describe(
        "Whether this is a modification to an existing landing page (true) or a new landing page (false)"
      ),
    previousCodeVersion: z
      .string()
      .optional()
      .describe(
        "The previous version of the code if this is a modification request"
      ),
    sessionId: z
      .string()
      .describe("Unique session identifier for version tracking"),
  }),
  execute: async ({
    userRequest,
    isModification,
    previousCodeVersion,
    sessionId,
  }) => {
    // Implementation in lib/code-generation/generate-code.ts
  },
});
```

## Tool Execution Flow

### Input Parameters

- **userRequest** (string, required): The user's natural language description of the landing page
- **isModification** (boolean, optional): Indicates if this is modifying existing code
- **previousCodeVersion** (string, optional): Previous code version for context (if modification)
- **sessionId** (string, required): Session identifier for version tracking

### Execution Steps

1. **Validate Input**: Check that userRequest is not empty, sessionId is valid
2. **Build Prompt**: Construct AI prompt with user request, conversation context, and previous code (if modification)
3. **Call AI Service**: Invoke AI model to generate HTML code with Tailwind CSS
4. **Validate Code**: Parse and validate generated HTML, fix common errors
5. **Determine Version**: Calculate next version number for session
6. **Save to Database**: Persist code to `landing_page_versions` table
7. **Update Preview**: Send postMessage to preview panel with new version
8. **Return Result**: Return structured result to chat system

### Return Value

```typescript
{
  success: boolean;
  versionId?: number;
  versionNumber?: number;
  codeContent?: string;
  error?: string;
  fixesApplied?: string[];
}
```

**Success Response**:

```json
{
  "success": true,
  "versionId": 123,
  "versionNumber": 2,
  "codeContent": "<!DOCTYPE html>...",
  "fixesApplied": ["Closed unclosed <div> tag", "Fixed invalid attribute"]
}
```

**Error Response**:

```json
{
  "success": false,
  "error": "Code generation failed: AI service timeout"
}
```

## Error Handling

### Code Generation Failures

- **AI Service Timeout**: Return error, show retry option in chat
- **Invalid Response**: Attempt to fix, if unfixable return error
- **Rate Limiting**: Return error with rate limit message

### Database Save Failures

- **Connection Error**: Keep code in memory, show error with retry option
- **Validation Error**: Return error, don't save invalid code
- **Constraint Violation**: Return error (duplicate version number)

### Code Validation Failures

- **Unfixable Errors**: Log warning, save code anyway (let preview handle)
- **Critical Errors**: Return error, don't save

## Integration with Chat API

The tool is added to the `tools` array in the `streamText` call:

```typescript
const result = streamText({
  model,
  messages: modelMessages,
  tools: {
    generate_landing_page_code: generateLandingPageCodeTool,
  },
});
```

The AI model automatically:

1. Detects when user requests landing page creation/modification
2. Invokes the tool with appropriate parameters
3. Receives tool result
4. Formats result for display in chat
5. Streams response to user

## Request Queue Management

### Queue State

- Maintained per user session in API route handler
- Tracks if code generation is currently in progress
- Queues new requests if generation in progress

### Queue Behavior

- **If generation in progress**: Queue request, return immediately with "queued" status
- **If queue empty**: Process immediately
- **On completion**: Process next queued request
- **On error**: Clear queue, show error, allow retry

## Preview Panel Communication

After successful save, send postMessage to preview iframe:

```typescript
previewIframe.contentWindow?.postMessage(
  {
    type: "UPDATE_PREVIEW",
    versionId: versionId,
    versionNumber: versionNumber,
    previewUrl: `/preview/${sessionId}/${versionNumber}`,
  },
  "*"
);
```

Preview panel listens for messages and updates iframe src or content accordingly.

## Rate Limiting

- Limit: 10 code generation requests per user per minute
- Exceeded: Return error with rate limit message
- Queue: Rate limit applies to queued requests too

## Authentication

- Tool execution requires authenticated user (existing auth middleware)
- User ID extracted from session
- All database operations scoped to authenticated user

## Versioning

- API version: v1 (implicit, no versioning header needed)
- Tool schema version: 1.0
- Backward compatibility: Maintained for tool parameter changes
