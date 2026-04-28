"use client";

import React, { useState, useEffect } from 'react';
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  ArrowPathIcon,
  EyeIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { buildPublishedSiteUrlOrNull } from "@/lib/preview/deploy-host";

interface PublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  onPublishSuccess?: (publishedUrl: string) => void;
}

export function PublishModal({
  open,
  onOpenChange,
  chatId,
  onPublishSuccess,
}: PublishModalProps) {
  const t = useTranslations("builder.publish");
  const [activeTab, setActiveTab] = useState('web');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string>('');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && chatId) {
      fetchPublishedSite();
    }
  }, [open, chatId]);

  const fetchPublishedSite = async () => {
    try {
      const response = await fetch(`/api/publish?chatId=${chatId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.publishedUrl) {
          setPublishedUrl(data.publishedUrl);
          if (data.publicId) {
            setCustomUrl(data.publicId);
          } else {
            // Fallback: derive the trailing slug from the URL.
            const urlParts = String(data.publishedUrl).split('/');
            setCustomUrl(urlParts[urlParts.length - 1] ?? '');
          }
        }
      }
    } catch (err) {
      console.log('No existing published site');
    }
  };

  const handlePublish = async () => {
    if (!chatId) {
      setError(t("chatIdRequired"));
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("publishFailed"));
      }

      setPublishedUrl(data.publishedUrl);
      if (data.publicId) {
        setCustomUrl(data.publicId);
      } else {
        const urlParts = String(data.publishedUrl).split('/');
        setCustomUrl(urlParts[urlParts.length - 1] ?? '');
      }

      if (onPublishSuccess) {
        onPublishSuccess(data.publishedUrl);
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("publishFailed"));
    } finally {
      setIsPublishing(false);
    }
  };

  const getFullUrl = () => {
    if (publishedUrl) return publishedUrl;
    if (!customUrl) return "";
    return buildPublishedSiteUrlOrNull(customUrl) ?? `/s/${customUrl}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t("title")}</DialogTitle>
        </DialogHeader>

        <DialogDescription>
          {t("description")}
        </DialogDescription>

        <div className="space-y-2">
          <Label htmlFor="url">{t("urlLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="url"
              value={getFullUrl()}
              readOnly={!isEditingUrl}
              className="flex-1 font-mono text-sm"
              placeholder={t("urlPlaceholder")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingUrl(!isEditingUrl)}
              disabled={!publishedUrl}
            >
              <PencilSquareIcon className="h-4 w-4 mr-1" />
              {t("editUrl")}
            </Button>
          </div>
          {isEditingUrl && (
            <div className="flex items-center gap-2">
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder={t("customUrlPlaceholder")}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditingUrl(false);
                }}
              >
                {t("save")}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="visibility">{t("visibilityLabel")}</Label>
          </div>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger id="visibility">
              <SelectValue placeholder={t("visibilityPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t("visibilityPublic")}</SelectItem>
              <SelectItem value="private">{t("visibilityPrivate")}</SelectItem>
              <SelectItem value="unlisted">{t("visibilityUnlisted")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button
            onClick={handlePublish}
            disabled={isPublishing}
            className="min-w-[120px]"
          >
            {isPublishing ? (
              <>
                <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                {t("publishing")}
              </>
            ) : (
              t("publishApp")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
