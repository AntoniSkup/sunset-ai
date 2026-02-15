"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Home, CreditCard, Settings, Pencil } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface ChatHeaderProps {
    chatId: string;
    chatName?: string | null;
    onRename?: (name: string) => void;
}

export function ChatHeader({ chatId, chatName, onRename }: ChatHeaderProps) {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);

    const saveRename = useCallback(
        async (newName: string) => {
            const trimmed = newName.trim();
            if (!trimmed) {
                setIsRenaming(false);
                return;
            }
            if (trimmed === (chatName || "Untitled Chat")) {
                setIsRenaming(false);
                return;
            }
            setIsSaving(true);
            try {
                const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: trimmed }),
                });
                if (res.ok) {
                    onRename?.(trimmed);
                    setIsRenaming(false);
                }
            } finally {
                setIsSaving(false);
            }
        },
        [chatId, chatName, onRename]
    );

    const handleRenameSelect = useCallback(() => {
        setRenameValue(chatName || "Untitled Chat");
        setIsRenaming(true);
    }, [chatName]);

    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveRename(renameValue);
            } else if (e.key === "Escape") {
                setIsRenaming(false);
            }
        },
        [renameValue, saveRename]
    );

    const handleInputBlur = useCallback(() => {
        saveRename(renameValue);
    }, [renameValue, saveRename]);

    return (
        <header className="h-12 ">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="w-6 h-6 rounded-full flex-shrink-0 bg-gradient-to-r from-[#DF5171] via-[#E6736A] to-[#EEAC7A] cursor-pointer hover:opacity-90 transition-opacity focus:outline-none  focus:ring-[#E6736A] hover:scale-105"
                                aria-label="Open menu"
                            />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem asChild>
                                <Link href="/start" className="flex items-center cursor-pointer">
                                    <Home className="mr-2 h-4 w-4" />
                                    Home
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/pricing" className="flex items-center cursor-pointer">
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Preview payment
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/dashboard/general" className="flex items-center cursor-pointer">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Settings
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex-1 min-w-0 flex items-center h-9 px-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 ease-in-out">
                        {isRenaming ? (
                            <Input
                                ref={inputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={handleInputKeyDown}
                                onBlur={handleInputBlur}
                                disabled={isSaving}
                                className="h-7 w-auto min-w-[8rem] max-w-64 text-sm font-medium border-0 shadow-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none selection:bg-[Highlight] selection:text-[HighlightText]"
                            />
                        ) : (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        type="button"
                                        className="w-full flex flex-col gap-0.5 leading-none text-left min-w-0 text-start justify-start items-start"
                                    >
                                        <span className="text-sm font-medium text-gray-900 truncate leading-none">
                                            {chatName || "Untitled Chat"}
                                        </span>
                                        <span className="text-xs text-gray-500 leading-none">
                                            Personal workspace
                                        </span>
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuItem onSelect={handleRenameSelect}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Rename chat
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

            </div>
        </header>
    );
}