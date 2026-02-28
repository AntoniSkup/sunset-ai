"use client";

import { useState, useEffect } from "react";
import { RocketLaunchIcon, CodeBracketIcon, EyeIcon } from "@heroicons/react/24/outline";
import { Button } from "../ui/button";
import { PublishModal } from "./publish-modal";
import { PublishedSuccessModal } from "./published-success-modal";
import type { PreviewPanelTab } from "./preview-panel";

interface PreviewPanelHeaderProps {
  chatId: string;
  activeTab: PreviewPanelTab;
  onTabChange: (tab: PreviewPanelTab) => void;
}

export default function PreviewPanelHeader({
  chatId,
  activeTab,
  onTabChange,
}: PreviewPanelHeaderProps) {
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (chatId) {
      checkPublishedStatus();
    }
  }, [chatId]);

  const checkPublishedStatus = async () => {
    try {
      const response = await fetch(`/api/publish?chatId=${chatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.publishedUrl) {
          setPublishedUrl(data.publishedUrl);
        }
      }
    } catch (err) {
      // soft
    }
  };

  const handlePublishSuccess = (url: string) => {
    setPublishedUrl(url);
    setIsPublishModalOpen(false);
    setIsSuccessModalOpen(true);
  };

  return (
    <>
      <header className="py-2">
        <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => onTabChange("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <EyeIcon className="size-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => onTabChange("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "code"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CodeBracketIcon className="size-4" />
              Code
            </button>
          </div>
          {publishedUrl ? (
            <Button
              variant="outline"
              onClick={() => setIsSuccessModalOpen(true)}
              className="text-sm bg-[#FF9FFC] hover:bg-[#FF9FFC]/80"
            >
              Published
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsPublishModalOpen(true)}
              className="group text-white bg-[#222424] rounded-lg cursor-pointer"
            >
              <RocketLaunchIcon className="size-4 transition-transform duration-200 ease-in-out group-hover:-rotate-45" />
              Publish
            </Button>
          )}
        </div>
      </header>

      <PublishModal
        open={isPublishModalOpen}
        onOpenChange={setIsPublishModalOpen}
        chatId={chatId}
        onPublishSuccess={handlePublishSuccess}
      />

      {publishedUrl && (
        <PublishedSuccessModal
          open={isSuccessModalOpen}
          onOpenChange={setIsSuccessModalOpen}
          publishedUrl={publishedUrl}
        />
      )}
    </>
  );
}
