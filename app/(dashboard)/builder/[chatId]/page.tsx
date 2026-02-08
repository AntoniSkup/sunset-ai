"use client";

import { Chat } from "@/components/chat/chat";
import { PreviewPanel } from "@/components/preview/preview-panel";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Suspense, use } from "react";
import { ChatHeader } from "@/components/chat/chat-header";
import PreviewPanelHeader from "@/components/preview/preview-panel-header";

function BuilderContent({
  chatId,
}: {
  chatId: string;
}) {
  return (
    <div className="h-full flex">
      <Group orientation="horizontal" className="flex-1 h-full">
        <Panel defaultSize={30}>
          <div className="h-full w-full border rounded-lg bg-background overflow-hidden flex flex-col">
            <div className="shrink-0">
              <ChatHeader />
            </div>
            <div className="flex-1 min-h-0">
              <Chat chatId={chatId} />
            </div>
          </div>
        </Panel>
        <Separator />
        <Panel defaultSize={70}>
          <div className="h-full w-full border rounded-lg bg-background overflow-hidden flex flex-col">
            <div className="shrink-0">
              <PreviewPanelHeader chatId={chatId} />
            </div>
            <div className="flex-1 min-h-0">
              <PreviewPanel chatId={chatId} />
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}

export default function BuilderChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = use(params);

  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center">Loading...</div>}>
      <BuilderContent chatId={chatId} />
    </Suspense>
  );
}

