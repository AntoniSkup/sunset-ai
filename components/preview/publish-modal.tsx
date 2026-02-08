"use client";

import React, { useState, useEffect } from 'react';
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
import { Loader2, Eye, Pencil } from 'lucide-react';

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
          const urlParts = data.publishedUrl.split('/');
          const siteId = urlParts[urlParts.length - 1];
          setCustomUrl(siteId);
        }
      }
    } catch (err) {
      console.log('No existing published site');
    }
  };

  const handlePublish = async () => {
    if (!chatId) {
      setError("Chat ID is required");
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
        throw new Error(data.error || 'Failed to publish site');
      }

      setPublishedUrl(data.publishedUrl);
      const urlParts = data.publishedUrl.split('/');
      const siteId = urlParts[urlParts.length - 1];
      setCustomUrl(siteId);

      if (onPublishSuccess) {
        onPublishSuccess(data.publishedUrl);
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish site');
    } finally {
      setIsPublishing(false);
    }
  };

  const getFullUrl = () => {
    if (!customUrl) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/api/published/${customUrl}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} >
      <DialogContent className="sm:max-w-[600px] !fixed !left-[50%] !bottom-4 !translate-x-[-50%] !translate-y-0 !top-auto data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Publish Your App</DialogTitle>
        </DialogHeader>

        <DialogDescription>
          Once published, the app will be visible to users based on its visibility settings.
        </DialogDescription>

        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <div className="flex items-center gap-2">
            <Input
              id="url"
              value={getFullUrl()}
              readOnly={!isEditingUrl}
              className="flex-1 font-mono text-sm"
              placeholder="URL will be generated after publishing"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditingUrl(!isEditingUrl)}
              disabled={!publishedUrl}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit URL
            </Button>
          </div>
          {isEditingUrl && (
            <div className="flex items-center gap-2">
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="custom-url-id"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditingUrl(false);
                  // TODO: Implement URL update API
                }}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="visibility">App Visibility</Label>
          </div>
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger id="visibility">
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public (no login)</SelectItem>
              <SelectItem value="private">Private (login required)</SelectItem>
              <SelectItem value="unlisted">Unlisted (link only)</SelectItem>
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              'Publish App'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
