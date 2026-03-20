"use client";

import {
  MessageAttachment,
  MessageAttachments,
} from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { ArrowPathIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import type { FileUIPart } from "ai";
import { FormEvent, useEffect, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

type PendingAttachment = {
  localId: string;
  id: number | null;
  alias: string;
  blobUrl: string;
  mimeType: string;
  intent: "reference" | "site_asset" | "both";
  isUploading?: boolean;
};

interface ChatInputProps {
  input: string;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  isUploadingAttachments: boolean;
  pendingAttachments: PendingAttachment[];
  attachmentError: string | null;
  onFilesSelected: (files: FileList | null) => void;
  onAttachmentIntentChange: (
    assetId: number,
    intent: PendingAttachment["intent"]
  ) => void;
  onAttachmentRemove: (localId: string) => void;
  /** When true, printable keys focus the input and append when focus is not already in an editable field (builder). */
  captureGlobalTyping?: boolean;
  onInsertText?: (text: string) => void;
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const el = target;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.closest("[contenteditable='true']") != null;
}

export function ChatInput({
  input,
  handleSubmit,
  handleInputChange,
  isLoading,
  isUploadingAttachments,
  pendingAttachments,
  attachmentError,
  onFilesSelected,
  onAttachmentIntentChange,
  onAttachmentRemove,
  captureGlobalTyping = false,
  onInsertText,
}: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = input.trim().length > 0 || pendingAttachments.length > 0;

  useEffect(() => {
    if (
      !captureGlobalTyping ||
      !onInsertText ||
      isLoading ||
      isUploadingAttachments
    ) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        textareaRef.current &&
        (t === textareaRef.current || textareaRef.current.contains(t as Node))
      ) {
        return;
      }
      if (isEditableKeyTarget(t)) return;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        textareaRef.current?.focus();
        onInsertText(e.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [captureGlobalTyping, onInsertText, isLoading, isUploadingAttachments]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (
        !isLoading &&
        !isUploadingAttachments &&
        canSubmit &&
        formRef.current
      ) {
        formRef.current.requestSubmit();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(e.target.files);
    e.target.value = "";
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-transparent p-2 ">
      <div className="relative overflow-hidden rounded-lg border border-gray-500 bg-white shadow-xs">
        <div
          className={cn(
            "overflow-hidden transition-[max-height,opacity,padding,border-color] duration-300 ease-out",
            pendingAttachments.length > 0
              ? "max-h-28 opacity-100 px-3 pt-3 pb-2"
              : "max-h-0 opacity-0  px-3 pt-0 pb-0"
          )}
        >
          <MessageAttachments className="ml-0 flex-nowrap gap-2 overflow-hidden">
            {pendingAttachments.map((attachment) => (
              <MessageAttachment
                key={attachment.localId}
                className="size-16 rounded-xl  shrink-0"
                data={
                  {
                    type: "file",
                    url: attachment.blobUrl,
                    mediaType: attachment.mimeType,
                    filename: attachment.alias,
                  } as FileUIPart
                }
                onRemove={() => onAttachmentRemove(attachment.localId)}
              />
            ))}
          </MessageAttachments>
        </div>
        <div className="relative rounded-b-lg pb-12">
          <TextareaAutosize
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to change?"
            minRows={3}
            maxRows={10}
            className={cn(
              "w-full resize-none overflow-y-auto pl-4 pt-4 pr-16 pb-2 text-sm",
              "focus:outline-none bg-transparent",
              "placeholder:text-muted-foreground",
              "disabled:opacity-50"
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute bottom-3 left-3 h-8 w-8 cursor-pointer rounded-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAttachments}
            aria-label="Attach image"
            title="Attach image"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
          <Button
            type="submit"
            disabled={isLoading || isUploadingAttachments || !canSubmit}
            size="icon"
            className={cn(
              "absolute bottom-3 right-3 h-8 w-8 rounded-full bg-[#222424]",

              isLoading || isUploadingAttachments || !canSubmit
                ? "bg-muted text-muted-foreground hover:bg-muted"
                : ""
            )}
            aria-label="Send message"
            title="Send message"
          >
            {isLoading ? (
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowUpIcon className="h-6 w-6" strokeWidth={2} />
            )}
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        id="chat-file-upload"
        className="hidden"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleFileChange}
      />
      {attachmentError && (
        <p className="px-1 pt-2 text-sm text-destructive">{attachmentError}</p>
      )}
    </form>
  );
}
