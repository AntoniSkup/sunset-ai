"use client";

import { Chat } from "@/components/chat/chat";
import { PreviewPanel } from "@/components/preview/preview-panel";
import { Group, Panel, Separator } from "react-resizable-panels";

export default function BuilderPage() {
  return (
    <div className="h-full flex">
      <Group orientation="horizontal" className="flex-1 h-full">
        <Panel defaultSize={30} minSize={30}>
          <div className="h-full w-full border rounded-lg bg-background overflow-hidden">
            <Chat />
          </div>
        </Panel>
        <Separator />
        <Panel defaultSize={70} minSize={30}>
          <div className="h-full w-full border rounded-lg bg-background overflow-hidden">
            <PreviewPanel />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
