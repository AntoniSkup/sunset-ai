# API Contract: Multi-file Site Generation Tools (Option A)

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool  
**Type**: Vercel AI SDK Tool/Function

## Overview

The code generation tool is integrated into the chat API route (`app/api/chat/route.ts`) as a Vercel AI SDK tool. It is invoked automatically by the AI model when it detects a user request for landing page creation or modification.

## Tools

### Tool: `create_site`

#### Description

Initializes a new landing site for the current chat. Typically creates the entry layout document (e.g., `landing/index.html`) and any default structure needed for the follow-up `create_section` calls.

#### Input schema (proposed)

```typescript
import { tool } from "ai";

const createSiteTool = tool({
  description:
    "Initialize a new landing site for this chat. Creates the entry layout document and returns the current revision info for preview.",
  parameters: z.object({
    userRequest: z
      .string()
      .min(1)
      .describe("High-level description of the site (brand, goal, audience)."),
  }),
});
```

#### Output (proposed)

Returns the latest revision info after initialization:

```typescript
{
  success: boolean;
  chatId: string;
  revisionId?: number;
  revisionNumber?: number;
  error?: string;
}
```

---

### Tool: `create_section`

#### Description

Creates or modifies **exactly one HTML file** (layout, page, or section) identified by `destination` (path). Use this repeatedly to build a full site: layout → page → sections.

#### Input schema (required for Option A)

```typescript
import { tool } from "ai";

const createSectionTool = tool({
  description:
    "Create or modify one HTML file (layout/page/section) for the current landing site. One tool call writes exactly one file.",
  parameters: z.object({
    destination: z
      .string()
      .min(1)
      .describe("Normalized relative .html path, e.g. landing/sections/hero.html"),
    userRequest: z
      .string()
      .min(1)
      .describe("Instructions for ONLY this file's content and style."),
    isModification: z
      .boolean()
      .optional()
      .describe("True when updating an existing file; false when creating a new file."),
  }),
});
```

#### Output (proposed)

```typescript
{
  success: boolean;
  chatId: string;
  destination: string;
  revisionId?: number;
  revisionNumber?: number;
  error?: string;
}
```

## Execution flow (Option A)

1. **Validate input**: ensure `destination` is a safe normalized `.html` path
2. **Load previous file (if modification)**: fetch latest file content for (`chatId`, `destination`)
3. **Build prompt**: include previous file content when modifying, otherwise generate from scratch
4. **Call AI service**: generate raw HTML for this single file
5. **Validate/fix**: enforce fragment vs full-doc expectations based on file kind
6. **Create new revision**: insert a new `landing_site_revisions` row for this chat
7. **Upsert file row**: ensure `landing_site_files` exists for (`chatId`, `destination`)
8. **Save file version**: insert `landing_site_file_versions` linking file + revision
9. **Update preview**: preview loads `/api/preview/{chatId}/{revisionNumber}` and composes the entry document by resolving `<!-- include: ... -->`

### Return Value

```typescript
{
  success: boolean;
  revisionId?: number;
  revisionNumber?: number;
  error?: string;
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

Tools are added to the `tools` object in the `streamText` call:

```typescript
const result = streamText({
  model,
  messages: modelMessages,
  tools: {
    create_site: createSiteTool,
    create_section: createSectionTool,
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
