"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ProviderResult {
  text: string;
  language: string;
  processing_time_seconds: number;
  cost: number;
  confidence: number;
}

interface ComparisonResultProps {
  localResult: ProviderResult;
  cloudResult: ProviderResult;
  audioDuration?: number;
  onCopy: (text: string) => void;
  onDownload: (text: string, provider: string) => void;
}

export function ComparisonResult({
  localResult,
  cloudResult,
  audioDuration,
  onCopy,
  onDownload,
}: ComparisonResultProps) {
  const [activeTab, setActiveTab] = useState<"side-by-side" | "diff">("side-by-side");
  const [copiedProvider, setCopiedProvider] = useState<string | null>(null);

  const handleCopy = async (text: string, provider: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedProvider(provider);
    setTimeout(() => setCopiedProvider(null), 2000);
    onCopy(text);
  };

  // Determine winners for each metric
  const speedWinner = localResult.processing_time_seconds <= cloudResult.processing_time_seconds ? "local" : "cloud";
  const costWinner = localResult.cost <= cloudResult.cost ? "local" : "cloud";
  const confidenceWinner = localResult.confidence >= cloudResult.confidence ? "local" : "cloud";

  const localWins = [speedWinner, costWinner, confidenceWinner].filter(w => w === "local").length;
  const cloudWins = 3 - localWins;

  const formatTime = (seconds: number) => {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return "FREE";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  // Simple word diff for highlighting differences
  const getDiff = () => {
    const localWords = localResult.text.split(/\s+/);
    const cloudWords = cloudResult.text.split(/\s+/);

    const localSet = new Set(localWords.map(w => w.toLowerCase()));
    const cloudSet = new Set(cloudWords.map(w => w.toLowerCase()));

    const localHighlighted = localWords.map((word, i) => {
      const isUnique = !cloudSet.has(word.toLowerCase());
      return { word, isUnique, key: `local-${i}` };
    });

    const cloudHighlighted = cloudWords.map((word, i) => {
      const isUnique = !localSet.has(word.toLowerCase());
      return { word, isUnique, key: `cloud-${i}` };
    });

    return { localHighlighted, cloudHighlighted };
  };

  const diff = getDiff();

  return (
    <Card className="mt-6">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
          Transcription Comparison
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Metrics Comparison Bar */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          {/* Speed */}
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Speed
            </div>
            <div className="space-y-1">
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${speedWinner === "local" ? "text-green-600" : ""}`}>
                <span className="w-12 text-right">Local</span>
                <span className="font-mono">{formatTime(localResult.processing_time_seconds)}</span>
                {speedWinner === "local" && <span className="text-green-500">✓</span>}
              </div>
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${speedWinner === "cloud" ? "text-blue-600" : ""}`}>
                <span className="w-12 text-right">Cloud</span>
                <span className="font-mono">{formatTime(cloudResult.processing_time_seconds)}</span>
                {speedWinner === "cloud" && <span className="text-blue-500">✓</span>}
              </div>
            </div>
          </div>

          {/* Cost */}
          <div className="text-center border-x border-border">
            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Cost
            </div>
            <div className="space-y-1">
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${costWinner === "local" ? "text-green-600" : ""}`}>
                <span className="w-12 text-right">Local</span>
                <span className="font-mono">{formatCost(localResult.cost)}</span>
                {costWinner === "local" && <span className="text-green-500">✓</span>}
              </div>
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${costWinner === "cloud" ? "text-blue-600" : ""}`}>
                <span className="w-12 text-right">Cloud</span>
                <span className="font-mono">{formatCost(cloudResult.cost)}</span>
                {costWinner === "cloud" && <span className="text-blue-500">✓</span>}
              </div>
            </div>
          </div>

          {/* Confidence */}
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
              Confidence
            </div>
            <div className="space-y-1">
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${confidenceWinner === "local" ? "text-green-600" : ""}`}>
                <span className="w-12 text-right">Local</span>
                <span className="font-mono">{Math.round(localResult.confidence * 100)}%</span>
                {confidenceWinner === "local" && <span className="text-green-500">✓</span>}
              </div>
              <div className={`text-sm font-medium flex items-center justify-center gap-1 ${confidenceWinner === "cloud" ? "text-blue-600" : ""}`}>
                <span className="w-12 text-right">Cloud</span>
                <span className="font-mono">{Math.round(cloudResult.confidence * 100)}%</span>
                {confidenceWinner === "cloud" && <span className="text-blue-500">✓</span>}
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("side-by-side")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "side-by-side" ? "bg-background shadow-sm" : "hover:bg-background/50"
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setActiveTab("diff")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "diff" ? "bg-background shadow-sm" : "hover:bg-background/50"
              }`}
            >
              Show Differences
            </button>
          </div>

          <div className="text-sm text-muted-foreground">
            {localResult.language?.toUpperCase()} • {audioDuration ? `${Math.round(audioDuration)}s audio` : ""}
          </div>
        </div>

        {/* Side by Side Transcriptions */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Local Result */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-green-50 dark:bg-green-950/30 px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <span className="font-medium text-sm">Local</span>
                {localWins >= 2 && (
                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleCopy(localResult.text, "local")}
                >
                  {copiedProvider === "local" ? "Copied!" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onDownload(localResult.text, "local")}
                >
                  Download
                </Button>
              </div>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto text-sm leading-relaxed">
              {activeTab === "diff" ? (
                <p>
                  {diff.localHighlighted.map(({ word, isUnique, key }) => (
                    <span key={key} className={isUnique ? "bg-green-200 dark:bg-green-800 rounded px-0.5" : ""}>
                      {word}{" "}
                    </span>
                  ))}
                </p>
              ) : (
                <p>{localResult.text}</p>
              )}
            </div>
          </div>

          {/* Cloud Result */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                </svg>
                <span className="font-medium text-sm">Cloud (OpenAI)</span>
                {cloudWins >= 2 && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleCopy(cloudResult.text, "cloud")}
                >
                  {copiedProvider === "cloud" ? "Copied!" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onDownload(cloudResult.text, "cloud")}
                >
                  Download
                </Button>
              </div>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto text-sm leading-relaxed">
              {activeTab === "diff" ? (
                <p>
                  {diff.cloudHighlighted.map(({ word, isUnique, key }) => (
                    <span key={key} className={isUnique ? "bg-blue-200 dark:bg-blue-800 rounded px-0.5" : ""}>
                      {word}{" "}
                    </span>
                  ))}
                </p>
              ) : (
                <p>{cloudResult.text}</p>
              )}
            </div>
          </div>
        </div>

        {/* Verdict Footer */}
        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{localWins >= 2 ? "🏠" : "☁️"}</span>
            <div>
              <p className="font-medium text-sm">
                {localWins >= 2 ? "Local" : "Cloud"} wins {Math.max(localWins, cloudWins)}/3 metrics
              </p>
              <p className="text-xs text-muted-foreground">
                {localWins >= 2
                  ? "Free & private - great for most use cases"
                  : "Better accuracy - worth the cost for important transcriptions"}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>You saved <span className="text-green-600 font-medium">{formatCost(cloudResult.cost - localResult.cost)}</span> using Local</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
