"use client";



interface ChatHeaderProps {
    chatId: string;
    chatName?: string | null;
}

export function ChatHeader({ chatId, chatName }: ChatHeaderProps) {
    return (
        <header className="h-12 ">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-black flex-shrink-0" />

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