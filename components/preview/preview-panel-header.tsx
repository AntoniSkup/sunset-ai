"use client";

import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { PublishModal } from './publish-modal'
import { PublishedSuccessModal } from './published-success-modal'
import { MoreVertical } from 'lucide-react'

interface PreviewPanelHeaderProps {
    chatId: string;
}

export default function PreviewPanelHeader({ chatId }: PreviewPanelHeaderProps) {
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
            <header className="h-12 ">
                <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-end items-center">
                    {publishedUrl ? (
                        <Button
                            variant="outline"
                            onClick={() => setIsSuccessModalOpen(true)}
                            className="text-sm"
                        >
                            Published
                        </Button>
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setIsPublishModalOpen(true)}>
                                    Publish
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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