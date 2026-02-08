import { Suspense } from "react";
import { Button } from "../ui/button";

export function ChatHeader() {
    return (
        <header className="h-12 border-b border-gray-200">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center space-x-4 justify-between w-full">
                    <Suspense fallback={<div className="h-7" />}>
                        <Button variant={"outline"}>
                            <span className="text-xs">Sunset Logo</span>
                        </Button>
                    </Suspense>
                </div>
            </div>
        </header>
    );
}