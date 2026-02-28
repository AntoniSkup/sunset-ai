export function buildChatNamePrompt(userQuestion: string): string {
  return `
  You are an AI website builder agent.
Generate a short, descriptive title (max 60 characters) for a website project based on this request: "
${userQuestion}

Respond with ONLY the title, no other text.
`;
}