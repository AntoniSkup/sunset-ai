import React from 'react'
import { Button } from '../ui/button'

export default function PreviewPanelHeader() {
    return (
        <header className="h-12 border-b border-gray-200">
            <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center space-x-4 justify-between w-full">
                    <Button variant={"default"}>
                        <span className="text-white text-xs">Publish</span>
                    </Button>
                </div>
            </div>
        </header>
    );
}