import { Chat } from "@/components/chat/chat";

export default function BuilderPage() {
  return (
    <div className="grid grid-cols-[400px_1fr] h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="border rounded-lg bg-background overflow-hidden">
        <Chat />
      </div>
      <div className="border rounded-lg bg-background flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Website Preview</p>
          <p className="text-sm">Preview will appear here</p>
        </div>
      </div>
    </div>
  );
}
