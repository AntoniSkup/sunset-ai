# Data Model: Multi-file Landing Site Generator (Option A)

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool

## Goal

Store a landing site as **multiple HTML files** (layout, pages, sections) with version history, so the AI can modify one file at a time while the preview renders a composed site.

## Key decisions (Phase 1)

- **Storage model**: Option A — `landing_site_files` + `landing_site_revisions` + `landing_site_file_versions`
- **Site key**: `chatId` (maps to `chats.public_id`) is the site/session identifier
- **Versioning model**: global, sequential **revision numbers per chatId** (r1, r2, r3...). Each revision may update 1+ files.
- **File paths**:
  - Stored as normalized **POSIX-style** paths (forward slashes), relative to the site root
  - Constraint: must end with `.html`, no leading `/`
- **Composition convention** (includes):
  - Use HTML comments in composed documents:
    - `<!-- include: landing/pages/home.html -->`
    - `<!-- include: landing/sections/hero.html -->`
  - Preview renderer resolves `include:` directives by inlining the referenced file contents.

## Entities

### Landing Site File

Represents a single named HTML file in the site (layout, page, or section).

**Table**: `landing_site_files`

**Fields**:

- `id` (serial, primary key)
- `chat_id` (varchar(32), foreign key → chats.public_id)
- `path` (varchar(255)): normalized, relative file path like `landing/index.html`
- `kind` (varchar(20)): `layout` | `page` | `section` | `other`
- `created_at` (timestamp)
- `updated_at` (timestamp)

**Constraints / indexes**:

- Unique (`chat_id`, `path`)
- Index on (`chat_id`)

### Landing Site Revision

Represents a single site-wide revision (r1, r2, r3...) that can update one or more files.

**Table**: `landing_site_revisions`

**Fields**:

- `id` (serial, primary key)
- `chat_id` (varchar(32), foreign key → chats.public_id)
- `user_id` (integer, foreign key → users.id)
- `revision_number` (integer): sequential per chatId
- `created_at` (timestamp)

**Constraints / indexes**:

- Unique (`chat_id`, `revision_number`)
- Index on (`chat_id`, `revision_number`)
- Index on (`user_id`)

### Landing Site File Version

Represents the content of one file at a specific revision.

**Table**: `landing_site_file_versions`

**Fields**:

- `id` (serial, primary key)
- `file_id` (integer, foreign key → landing_site_files.id)
- `revision_id` (integer, foreign key → landing_site_revisions.id)
- `content` (text): raw HTML for that single file
- `created_at` (timestamp)

**Constraints / indexes**:

- Unique (`file_id`, `revision_id`) (a file can be written at most once per revision)
- Index on (`file_id`)
- Index on (`revision_id`)

### Code Generation Request (Transient)

Represents a user's natural language request that triggers code generation. This is not persisted as a separate entity but tracked via chat messages.

**Fields** (conceptual, stored in chat system):

- `request_text` (text): User's natural language request
- `timestamp` (timestamp): When request was made
- `session_id` (varchar): Session identifier
- `user_id` (integer): User making request
- `resulting_version_id` (integer, nullable): Reference to generated landing page version (if successful)

**Note**: This entity is managed by the chat system. The code generation tool receives this information but doesn't persist it separately.

## Rendering model (how preview picks file contents)

Given a target revision \(rN\):

- Find the set of files for the site (`landing_site_files` where `chat_id = chatId`)
- For each file, select the most recent version at or before \(rN\)
  - Implementation detail: either a query-per-file (fine for MVP) or a single SQL query using `DISTINCT ON (file_id)` ordered by `revision_number DESC`
- Choose an **entry file** (for MVP: `landing/index.html`)
- Inline `<!-- include: ... -->` directives by loading the referenced file contents at the same revision.

## Database Schema (Drizzle ORM)

```typescript
export const landingSiteFiles = pgTable(
  "landing_site_files",
  {
    id: serial("id").primaryKey(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    path: varchar("path", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull().default("section"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    chatPathUnique: unique().on(table.chatId, table.path),
    chatIdIdx: index("landing_site_files_chat_id_idx").on(table.chatId),
  })
);

export const landingSiteRevisions = pgTable(
  "landing_site_revisions",
  {
    id: serial("id").primaryKey(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    revisionNumber: integer("revision_number").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatRevisionUnique: unique().on(table.chatId, table.revisionNumber),
    chatRevisionIdx: index("landing_site_revisions_chat_revision_idx").on(
      table.chatId,
      table.revisionNumber
    ),
    userIdIdx: index("landing_site_revisions_user_id_idx").on(table.userId),
  })
);

export const landingSiteFileVersions = pgTable(
  "landing_site_file_versions",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .notNull()
      .references(() => landingSiteFiles.id),
    revisionId: integer("revision_id")
      .notNull()
      .references(() => landingSiteRevisions.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    fileRevisionUnique: unique().on(table.fileId, table.revisionId),
    fileIdIdx: index("landing_site_file_versions_file_id_idx").on(table.fileId),
    revisionIdIdx: index("landing_site_file_versions_revision_id_idx").on(
      table.revisionId
    ),
  })
);
```

## State Transitions

### Revision creation flow (single-file update)

1. **Request Received**: User requests a new site or a change to an existing one
2. **Select destination**: The model chooses exactly one file `path` to create/modify for this tool call
3. **Code Generation**: AI generates raw HTML for that single file
4. **Validate/normalize**: Ensure path normalization and HTML validity expectations for the file kind
5. **Create revision**: Insert `landing_site_revisions` row with next `revision_number` for `chat_id`
6. **Upsert file**: Ensure `landing_site_files` exists for (`chat_id`, `path`)
7. **Save file version**: Insert `landing_site_file_versions` row for (`file_id`, `revision_id`)
8. **Preview update**: Preview loads revision \(rN\) and composes `landing/index.html` by resolving includes

### Revision number assignment

- Query: `SELECT MAX(revision_number) FROM landing_site_revisions WHERE chat_id = ?`
- If no revisions: start at 1
- Else: MAX + 1

### Most recent revision query

- Query: `SELECT * FROM landing_site_revisions WHERE chat_id = ? ORDER BY revision_number DESC LIMIT 1`
- Used to display latest site state in preview panel

## Validation Rules

### File path validation

- Must be a normalized relative path (no leading `/`, no `..` segments)
- Must end with `.html`
- Use `/` separators (POSIX-style)

### HTML content validation

- **Non-empty**: Content must not be empty
- **Size limit**: Keep under 1MB per file (MVP)
- **HTML structure**:
  - `layout` / entry documents may be full HTML docs (include `<!DOCTYPE html>` etc.)
  - `section` documents should be fragment-safe (ideally one root `<section>`)
- **Encoding**: UTF-8 encoding assumed

### Revision number validation

- **Positive integer**: Must be >= 1
- **Sequential per chat**: Must be MAX(revision_number) + 1 for chat_id
- **Unique per chat**: Cannot duplicate revision_number within same chat_id

### Chat ID validation

- **Non-empty**: chatId must not be null or empty
- **Format**: constrained to existing `chats.public_id` format (length 32)
- **Uniqueness**: Different chats can have the same revision numbers (isolated per chat)

## Data Volume Assumptions

- **Average file size**: ~5-50KB per file
- **Files per site**: ~5-20 (layout + 1 page + sections)
- **Revisions per chat**: typically 5-30
- **Storage estimate**: ~15 files × 20KB × 20 revisions worst-case ≈ 6MB per chat (acceptable for MVP; can prune later)

## Migration Strategy

1. Create `landing_site_files`, `landing_site_revisions`, `landing_site_file_versions`
2. Add FKs to `users` and `chats`
3. Add unique constraints and indexes
4. Keep existing `landing_page_versions` as legacy until preview is fully migrated

## Query Patterns (MVP)

### Get most recent revision for chat

```typescript
const latestRevision = await db
  .select()
  .from(landingSiteRevisions)
  .where(eq(landingSiteRevisions.chatId, chatId))
  .orderBy(desc(landingSiteRevisions.revisionNumber))
  .limit(1);
```

### Get next revision number

```typescript
const maxRevision = await db
  .select({ max: max(landingSiteRevisions.revisionNumber) })
  .from(landingSiteRevisions)
  .where(eq(landingSiteRevisions.chatId, chatId));

const nextRevision = (maxRevision[0]?.max ?? 0) + 1;
```

### Upsert file + create file version at a new revision

```typescript
const revision = await db
  .insert(landingSiteRevisions)
  .values({ chatId, userId, revisionNumber: nextRevision })
  .returning();

const file = await db
  .insert(landingSiteFiles)
  .values({ chatId, path, kind })
  .onConflictDoUpdate({
    target: [landingSiteFiles.chatId, landingSiteFiles.path],
    set: { updatedAt: sql`now()` },
  })
  .returning();

await db.insert(landingSiteFileVersions).values({
  fileId: file[0].id,
  revisionId: revision[0].id,
  content,
});
```
