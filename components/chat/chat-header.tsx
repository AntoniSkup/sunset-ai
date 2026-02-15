"use client";

import Link from "next/link";
import { Home, CreditCard, Settings } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatHeaderProps {
    chatId: string;
    chatName?: string | null;
}

export function ChatHeader({ chatId, chatName }: ChatHeaderProps) {
    return (
        <header className="h-12 ">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className="w-6 h-6 rounded-full flex-shrink-0 bg-gradient-to-r from-[#DF5171] via-[#E6736A] to-[#EEAC7A] cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#E6736A]"
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

                    <div className="flex flex-col min-w-0 ">
                        <span className="text-sm font-medium text-gray-900 truncate">
                            {chatName || "Untitled Chat"}
                        </span>
                        <span className="text-xs text-gray-500">
                            Personal workspace
                        </span>
                    </div>
                </div>

            </div>
        </header>
    );
}