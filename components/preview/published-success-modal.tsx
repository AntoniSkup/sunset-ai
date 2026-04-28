"use client";

import React from 'react';
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
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
  const t = useTranslations("builder.publishedSuccess");
  const [copied, setCopied] = useState(false);

  const getFullUrl = () => {
    if (!publishedUrl) return '';
    // The publish API returns an absolute URL on the deploy origin already;
    // legacy callers may still pass a path, so handle both.
    if (/^https?:\/\//i.test(publishedUrl)) return publishedUrl;
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
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <DialogTitle className="text-2xl font-bold">
              {t("title")}
            </DialogTitle>
          </div>
        </DialogHeader>

        <DialogDescription className="text-base">
          {t("description")}
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
                  <CheckIcon className="h-4 w-4 mr-1" />
                  {t("copied")}
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="h-4 w-4 mr-1" />
                  {t("copy")}
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
              <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
              {t("viewWebsite")}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
