# Implementation Plan: Landing Page Code Generation Tool

**Branch**: `002-landing-page-generator` | **Date**: 2025-12-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-landing-page-generator/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build a code generation tool that integrates with the existing chat system to generate landing page code (HTML with Tailwind CSS) from natural language requests. The tool uses Vercel AI SDK's function calling capabilities to invoke a code generation service, automatically fix common code errors, save generated code to the database, and update the preview panel. The preview panel displays a loading indicator during code generation and only shows the actual preview content once generation completes successfully. The system handles concurrent requests by queuing them sequentially, provides error recovery with retry options, and maintains version history per user session.

## Technical Context

**Language/Version**: TypeScript 5.8.3, React 19.1.0, Next.js 15.6.0-canary.59  
**Primary Dependencies**: Vercel AI SDK (`ai` package) with function calling, Drizzle ORM for database operations, PostgreSQL for storage, HTML parser/validator for code fixing, existing chat infrastructure  
**Storage**: PostgreSQL database (via Drizzle ORM) for persisting generated landing page code, version history, and session tracking  
**Testing**: React Testing Library with Vitest for component tests, integration tests for API routes and tool invocation, manual testing for code generation and preview updates  
**Target Platform**: Web browsers (modern browsers supporting React 19, Server-Side Rendering via Next.js App Router)  
**Project Type**: Web application (Next.js App Router with React Server Components and Client Components)  
**Performance Goals**: Code generation completes within 30 seconds, preview panel updates within 2 seconds of save completion, 95% success rate for generation and save operations, handle code up to 1MB per landing page  
**Constraints**: Sequential request processing (no concurrent generations), manual retry only (no auto-retry), code validation and error fixing before save, temporary in-memory storage for failed saves, version history per user session  
**Scale/Scope**: Single code generation tool integration, database persistence for generated code, version tracking per session, preview panel integration via postMessage

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### File Structure Preservation

✅ **PASS**: Implementation will follow existing Next.js App Router structure:

- Code generation tool logic will be placed in `lib/code-generation/` directory
- API route for tool invocation will extend `app/api/chat/route.ts` (add tool definitions)
- Database schema additions will be in `lib/db/schema.ts` (add landing page tables)
- Database queries will be in `lib/db/queries.ts` (add landing page queries)
- Preview panel communication utilities will be in `lib/preview/` (if needed)
- Uses existing shadcn/ui components from `components/ui/`
- No deviation from existing structure required

### No Code Comments

✅ **PASS**: All code will be self-documenting through:

- Descriptive function and variable names
- Explicit TypeScript type definitions
- Clear function boundaries and separation of concerns
- Meaningful error messages
- Well-structured code organization

### Additional Rules Compliance

✅ **PASS**:

- Error states will be explicit and actionable (error messages in chat with retry)
- No APIs or endpoints will be invented (uses Vercel AI SDK function calling patterns)
- Authentication handled via existing session system
- Simple solutions preferred (use existing AI SDK tools, not custom implementations)
- Database operations follow existing Drizzle ORM patterns

## Project Structure

### Documentation (this feature)

```text
specs/002-landing-page-generator/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
└── api/
    └── chat/
        └── route.ts              # Extended with tool definitions for code generation

lib/
├── code-generation/
│   ├── generate-code.ts         # Main code generation function
│   ├── fix-code-errors.ts       # Code validation and error fixing
│   ├── save-code.ts             # Database save operation with retry logic
│   └── types.ts                  # TypeScript types for code generation
├── db/
│   ├── schema.ts                 # Extended with landing_page_versions table
│   └── queries.ts                # Extended with landing page queries
└── preview/
    └── update-preview.ts         # Preview panel update via postMessage (loading state and content updates)

components/
└── chat/
    └── [existing chat components, no changes needed]
```

**Structure Decision**: Following Next.js App Router structure per constitution:

- Code generation domain logic in `lib/code-generation/` directory (matches existing `lib/auth/`, `lib/db/`, `lib/payments/` pattern)
- Database schema extensions in `lib/db/schema.ts` following existing table patterns
- API route extension in `app/api/chat/route.ts` to add tool definitions
- No new infrastructure beyond specified dependencies
- Preview panel communication handled via existing postMessage infrastructure (assumed to exist per spec)

## Complexity Tracking

No constitution violations. Implementation follows all established principles:

- File structure matches existing Next.js App Router patterns
- No code comments (self-documenting code)
- Simple solutions preferred (using Vercel AI SDK function calling rather than custom tool system)
- No new infrastructure beyond specified dependencies
- Database operations follow existing Drizzle ORM patterns
