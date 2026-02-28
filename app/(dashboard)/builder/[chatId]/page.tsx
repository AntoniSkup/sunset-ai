"use client";

import { Chat } from "@/components/chat/chat";
import { PreviewPanel } from "@/components/preview/preview-panel";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Suspense, use, useState, useEffect } from "react";
import { ChatHeader } from "@/components/chat/chat-header";
import PreviewPanelHeader from "@/components/preview/preview-panel-header";
import type { PreviewPanelTab } from "@/components/preview/preview-panel";

function BuilderContent({ chatId }: { chatId: string }) {
  const [chatName, setChatName] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewPanelTab>("preview");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
        if (!res.ok) {
          throw new Error("Failed to load chat");
        }
        const data = await res.json();
        if (!cancelled) {
          setChatName(data.chat?.title || null);
        }
      } catch (e) {
        if (!cancelled) {
          setChatName(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  return (
    <div className="h-full flex">
      <Group orientation="horizontal" className="flex-1 h-full">
        <Panel defaultSize={30}>
          <div className="h-full w-full rounded-lg bg-background overflow-hidden flex flex-col">
            <div className="shrink-0">
              <ChatHeader
                chatId={chatId}
                chatName={chatName}
                onRename={setChatName}
              />
            </div>
            <div className="flex-1 min-h-0">
              <Chat chatId={chatId} />
            </div>
          </div>
        </Panel>
        <Separator />
        <Panel defaultSize={70}>
          <div className="h-full w-full rounded-lg bg-background overflow-hidden flex flex-col pr-1">
            <div className="shrink-0">
              <PreviewPanelHeader
                chatId={chatId}
                activeTab={previewTab}
                onTabChange={setPreviewTab}
              />
            </div>
            <div className="flex-1 min-h-0 rounded-lg pb-2">
              <PreviewPanel chatId={chatId} activeTab={previewTab} />
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
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <BuilderContent chatId={chatId} />
    </Suspense>
  );
}
