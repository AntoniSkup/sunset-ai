"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Check, ExternalLink, Copy } from 'lucide-react';
import { useState } from 'react';

interface PublishedSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publishedUrl: string;
}

export function PublishedSuccessModal({
  open,
  onOpenChange,
  publishedUrl,
}: PublishedSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const getFullUrl = () => {
    if (!publishedUrl) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}${publishedUrl}`;
  };

  const handleCopy = async () => {
    const fullUrl = getFullUrl();
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const fullUrl = getFullUrl();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <DialogTitle className="text-2xl font-bold">
              Your website has been published!
            </DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription className="text-base">
          Your website is now live and accessible at the following URL:
        </DialogDescription>

        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <code className="flex-1 text-sm font-mono break-all">
              {fullUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="default"
              className="flex-1"
              onClick={() => window.open(fullUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Website
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
