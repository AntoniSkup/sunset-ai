"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChatInput } from "@/components/chat/chat-input";
import { nanoid } from "nanoid";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";

export default function StartPage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setIsLoading(true);

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userQuery: message }),
      });

      if (!response.ok) {
        throw new Error("Failed to create chat");
      }

      const data = await response.json();
      const chatId = data.chat.publicId;

      setPendingMessage({
        id: nanoid(),
        chatId,
        message,
        createdAt: Date.now(),
      });

      router.push(`/builder/${chatId}`);
    } catch (error) {
      console.error("Error creating chat:", error);
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-2xl px-4">
        <ChatInput
          input={input}
          handleSubmit={handleSubmit}
          handleInputChange={handleInputChange}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

