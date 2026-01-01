# Data Model: Landing Page Code Generation Tool

**Created**: 2025-12-25  
**Feature**: Landing Page Code Generation Tool

## Entities

### Landing Page Version

Represents a single version of generated website code for a landing page.

**Table**: `landing_page_versions`

**Fields**:

- `id` (serial, primary key): Unique identifier for the version record
- `user_id` (integer, foreign key → users.id): User who generated this version
- `session_id` (varchar, 255): Unique session identifier for grouping versions
- `version_number` (integer): Sequential version number within session (v1, v2, v3...)
- `code_content` (text): Generated HTML code with Tailwind CSS (up to 1MB per spec assumption)
- `created_at` (timestamp): When this version was generated
- `updated_at` (timestamp): When this version was last updated (initially same as created_at)

**Constraints**:

- `user_id` must reference existing user (foreign key constraint)
- `version_number` must be positive integer
- `code_content` cannot be null or empty
- `session_id` cannot be null
- Unique constraint on (`session_id`, `version_number`) to prevent duplicate versions

**Indexes**:

- Primary key on `id`
- Index on (`session_id`, `version_number`) for fast version queries
- Index on `user_id` for user-based queries
- Index on `created_at` for chronological queries

**Relationships**:

- Belongs to `User` (many-to-one via `user_id`)
- No direct relationship to chat messages (association via session_id and timestamps)

### Code Generation Request (Transient)

Represents a user's natural language request that triggers code generation. This is not persisted as a separate entity but tracked via chat messages.

**Fields** (conceptual, stored in chat system):

- `request_text` (text): User's natural language request
- `timestamp` (timestamp): When request was made
- `session_id` (varchar): Session identifier
- `user_id` (integer): User making request
- `resulting_version_id` (integer, nullable): Reference to generated landing page version (if successful)

**Note**: This entity is managed by the chat system. The code generation tool receives this information but doesn't persist it separately.

## Database Schema (Drizzle ORM)

```typescript
export const landingPageVersions = pgTable(
  "landing_page_versions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: varchar("session_id", { length: 255 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    codeContent: text("code_content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionVersionUnique: unique().on(table.sessionId, table.versionNumber),
    sessionVersionIdx: index("session_version_idx").on(
      table.sessionId,
      table.versionNumber
    ),
    userIdIdx: index("user_id_idx").on(table.userId),
    createdAtIdx: index("created_at_idx").on(table.createdAt),
  })
);

export const landingPageVersionsRelations = relations(
  landingPageVersions,
  ({ one }) => ({
    user: one(users, {
      fields: [landingPageVersions.userId],
      references: [users.id],
    }),
  })
);

export type LandingPageVersion = typeof landingPageVersions.$inferSelect;
export type NewLandingPageVersion = typeof landingPageVersions.$inferInsert;
```

## State Transitions

### Version Creation Flow

1. **Request Received**: User sends message requesting landing page creation
2. **Code Generation**: AI service generates HTML code with Tailwind CSS
3. **Code Validation**: System validates and fixes common errors
4. **Version Assignment**: System determines next version number for session (MAX + 1)
5. **Database Save**: System attempts to save version to database
6. **Success**: Version saved, preview updated, confirmation sent to chat
7. **Failure**: Code kept in memory, error shown with retry option

### Version Number Assignment

- Query: `SELECT MAX(version_number) FROM landing_page_versions WHERE session_id = ?`
- If no existing versions: start at 1
- If versions exist: use MAX + 1
- This ensures sequential numbering (v1, v2, v3...) per session

### Most Recent Version Query

- Query: `SELECT * FROM landing_page_versions WHERE session_id = ? ORDER BY version_number DESC LIMIT 1`
- Used to display latest version in preview panel
- Used for iterative refinement (include previous code in prompt)

## Validation Rules

### Code Content Validation

- **Non-empty**: Code content must not be empty
- **Size limit**: Code content must be under 1MB (enforced at application level)
- **HTML structure**: Should be valid HTML (validated by HTML parser before save)
- **Encoding**: UTF-8 encoding assumed

### Version Number Validation

- **Positive integer**: Must be >= 1
- **Sequential**: Must be MAX(version_number) + 1 for session
- **Unique per session**: Cannot duplicate version_number within same session_id

### Session ID Validation

- **Non-empty**: Session ID must not be null or empty
- **Format**: Should be consistent format (e.g., UUID or timestamp-based)
- **Uniqueness**: Different sessions can have same version numbers (isolated per session)

## Data Volume Assumptions

- **Average code size**: ~50-200KB per landing page (HTML + Tailwind classes)
- **Maximum code size**: 1MB per landing page (per spec assumption)
- **Versions per session**: Typically 1-10 versions (iterative refinement)
- **Sessions per user**: Multiple concurrent sessions possible
- **Storage estimate**: ~100KB average per version × 10 versions = ~1MB per session

## Migration Strategy

1. Create `landing_page_versions` table with all fields
2. Add foreign key constraint to `users` table
3. Create indexes for performance
4. Add unique constraint on (session_id, version_number)
5. No data migration needed (new feature)

## Query Patterns

### Get Most Recent Version for Session

```typescript
const latestVersion = await db
  .select()
  .from(landingPageVersions)
  .where(eq(landingPageVersions.sessionId, sessionId))
  .orderBy(desc(landingPageVersions.versionNumber))
  .limit(1);
```

### Get All Versions for Session

```typescript
const allVersions = await db
  .select()
  .from(landingPageVersions)
  .where(eq(landingPageVersions.sessionId, sessionId))
  .orderBy(asc(landingPageVersions.versionNumber));
```

### Get Next Version Number

```typescript
const maxVersion = await db
  .select({ max: max(landingPageVersions.versionNumber) })
  .from(landingPageVersions)
  .where(eq(landingPageVersions.sessionId, sessionId));

const nextVersion = (maxVersion[0]?.max ?? 0) + 1;
```

### Create New Version

```typescript
const newVersion = await db
  .insert(landingPageVersions)
  .values({
    userId: userId,
    sessionId: sessionId,
    versionNumber: nextVersion,
    codeContent: codeContent,
  })
  .returning();
```
