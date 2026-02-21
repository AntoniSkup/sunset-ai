"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { FormEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpCircleIcon } from "@heroicons/react/24/solid";

interface ChatInputProps {
  input: string;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
}

export function ChatInput({
  input,
  handleSubmit,
  handleInputChange,
  isLoading,
}: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && input.trim() && formRef.current) {
        formRef.current.requestSubmit();
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-transparent p-2 ">
      <div className="relative bg-white rounded-lg border shadow-xs">
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to change?"
          disabled={isLoading}
          className={cn(
            "w-full pl-4 pt-4 pr-16 text-sm resize-none overflow-auto ",
            "focus:outline-none bg-transparent rounded-t-lg",
            "placeholder:text-muted-foreground",
            "disabled:opacity-50"
          )}
          style={{
            height: "100px",
            minHeight: "100px",
            maxHeight: "400px",
          }}
        />
        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          size="icon"
          className={cn(
            "absolute top-4 right-4 w-[28px] h-[28px] p-1 rounded-full bg-[#222424]",
            // "absolute top-4 right-4 w-[28px] h-[28px] p-1 rounded-full bg-gradient-to-br from-[#ffac08]  to-[#ff6613]",

            isLoading || !input.trim()
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
      <input
        type="file"
        id="chat-file-upload"
        className="hidden"
        multiple
        accept=".jpg, .jpeg, .png, .pdf, .txt, .html"
      />
      {/* <div className="flex justify-between text-sm p-2"></div> */}
      {/* Here we will put the buttons at the buttom of the chat input */}
    </form>
  );
}
