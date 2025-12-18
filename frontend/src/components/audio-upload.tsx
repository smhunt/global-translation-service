"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ComparisonResult } from "@/components/comparison-result";

// Icons
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

interface CostMetrics {
  audio_duration_seconds: number;
  audio_duration_minutes: number;
  file_size_bytes: number;
  file_size_mb: number;
  processing_time_seconds: number;
  processing_speed_ratio: number;
  cloud_api_cost: number;
  local_compute_cost: number;
  savings: number;
  savings_percentage: number;
}

interface ProviderResult {
  text: string;
  language: string;
  processing_time_seconds: number;
  cost: number;
  confidence: number;
}

interface TranscriptionResult {
  text: string;
  language?: string;
  duration_seconds?: number;
  confidence?: number;
  cost_metrics?: CostMetrics;
  provider?: string;
  local_result?: ProviderResult;
  cloud_result?: ProviderResult;
}

interface ProgressData {
  job_id: string;
  status: string;
  progress: number;
  current_segment: number;
  total_segments: number;
  elapsed_seconds: number;
  estimated_remaining: number;
  current_text: string;
  message: string;
  estimated_cloud_cost?: number;
  audio_duration_seconds?: number;
  file_size_mb?: number;
  provider?: string;
  result?: TranscriptionResult;
}

interface ServiceStatus {
  status: string;
  model: string;
  device: string;
  message: string;
  cloud_available: boolean;
}

type Provider = "local" | "cloud" | "both";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://10.10.10.24:3085";

export function AudioUpload() {
  const { userId } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [provider, setProvider] = useState<Provider>("local");
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleCopyToClipboard = useCallback(async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [result?.text]);

  const handleDownload = useCallback(() => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file ? `${file.name.replace(/\.[^/.]+$/, "")}_transcript.txt` : "transcript.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result?.text, file]);

  // Check if cloud is available
  useEffect(() => {
    fetch(`${API_URL}/api/v1/transcribe/status`)
      .then((res) => res.json())
      .then((data: ServiceStatus) => {
        setCloudAvailable(data.cloud_available);
      })
      .catch(() => setCloudAvailable(false));
  }, []);

  // Check if history is available
  useEffect(() => {
    fetch(`${API_URL}/api/v1/transcripts/status`)
      .then((res) => res.json())
      .then((data: { available: boolean }) => {
        setHistoryAvailable(data.available);
      })
      .catch(() => setHistoryAvailable(false));
  }, []);

  // Save transcript to history
  const saveToHistory = useCallback(async (
    transcriptResult: TranscriptionResult,
    fileName: string,
    fileSize: number
  ) => {
    if (!userId || !historyAvailable) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/transcripts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          file_name: fileName,
          file_size_bytes: fileSize,
          audio_duration_seconds: transcriptResult.duration_seconds,
          text: transcriptResult.text,
          language: transcriptResult.language,
          confidence: transcriptResult.confidence,
          provider: transcriptResult.provider || provider,
          cost_metrics: transcriptResult.cost_metrics,
        }),
      });

      if (response.ok) {
        setSaved(true);
      }
    } catch (err) {
      console.error("Failed to save transcript:", err);
    }
  }, [userId, historyAvailable, provider]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("audio/")) {
      setFile(droppedFile);
      setError(null);
      setResult(null);
      setProgress(null);
    } else {
      setError("Please drop an audio file");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
      setProgress(null);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setIsTranscribing(false);
    setError(null);
    setProgress(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Start the transcription job with provider
      const response = await fetch(`${API_URL}/api/v1/transcribe/start?provider=${provider}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const { job_id } = await response.json();
      setIsUploading(false);
      setIsTranscribing(true);

      // Connect to SSE endpoint for progress updates
      const eventSource = new EventSource(
        `${API_URL}/api/v1/transcribe/progress/${job_id}`
      );
      eventSourceRef.current = eventSource;

      const currentFile = file;
      eventSource.onmessage = (event) => {
        try {
          const data: ProgressData = JSON.parse(event.data);
          setProgress(data);

          if (data.status === "complete" && data.result) {
            setResult(data.result);
            setIsTranscribing(false);
            eventSource.close();
            // Save to history
            if (currentFile) {
              saveToHistory(data.result, currentFile.name, currentFile.size);
            }
          } else if (data.status === "error") {
            setError(data.message || "Transcription failed");
            setIsTranscribing(false);
            eventSource.close();
          }
        } catch (err) {
          console.error("Failed to parse progress data:", err);
        }
      };

      eventSource.onerror = () => {
        setError("Connection lost. Please try again.");
        setIsTranscribing(false);
        eventSource.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setIsUploading(false);
      setIsTranscribing(false);
    }
  };

  const handleClear = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(null);
    setIsUploading(false);
    setIsTranscribing(false);
    setSaved(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const isProcessing = isUploading || isTranscribing;

  return (
    <div className="w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            Upload Audio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Transcription Provider</label>
            <div className="flex gap-2">
              <button
                onClick={() => setProvider("local")}
                disabled={isProcessing}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  provider === "local"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-medium">Local</div>
                <div className="text-xs opacity-70">Free, private</div>
              </button>
              <button
                onClick={() => setProvider("cloud")}
                disabled={isProcessing || !cloudAvailable}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  provider === "cloud"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                } ${isProcessing || !cloudAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-medium">Cloud</div>
                <div className="text-xs opacity-70">
                  {cloudAvailable ? "$0.006/min" : "No API key"}
                </div>
              </button>
              <button
                onClick={() => setProvider("both")}
                disabled={isProcessing || !cloudAvailable}
                className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                  provider === "both"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                } ${isProcessing || !cloudAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-medium">Compare</div>
                <div className="text-xs opacity-70">Both providers</div>
              </button>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center
              transition-colors duration-200
              ${isProcessing ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
              ${isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
            <div className="flex flex-col items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <p className="text-lg font-medium">
                {isDragging ? "Drop audio file here" : "Drag & drop audio file"}
              </p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
              <p className="text-xs text-muted-foreground mt-2">
                Supports MP3, WAV, M4A, OGG, FLAC
              </p>
            </div>
          </div>

          {/* Selected File Info */}
          {file && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <div>
                  <p className="font-medium truncate max-w-[300px]">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear} disabled={isProcessing}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </Button>
            </div>
          )}

          {/* Progress Section */}
          {isProcessing && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {progress?.message || (isUploading ? "Uploading..." : "Starting...")}
                </span>
                <span className="text-muted-foreground">
                  {progress?.progress ? `${Math.round(progress.progress)}%` : "0%"}
                </span>
              </div>

              <Progress value={progress?.progress || 0} className="h-2" />

              {progress && progress.status === "transcribing" && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Elapsed: {formatTime(progress.elapsed_seconds)}</span>
                    {progress.estimated_remaining > 0 && (
                      <span>Est. remaining: ~{formatTime(progress.estimated_remaining)}</span>
                    )}
                  </div>

                  {progress.audio_duration_seconds !== undefined && progress.audio_duration_seconds > 0 && (
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                      <span>Audio: {formatTime(progress.audio_duration_seconds)}</span>
                      {progress.file_size_mb !== undefined && progress.file_size_mb > 0 && (
                        <span>File: {progress.file_size_mb.toFixed(1)} MB</span>
                      )}
                      {progress.estimated_cloud_cost !== undefined && progress.estimated_cloud_cost > 0 && (
                        <span className="text-green-600 dark:text-green-400">
                          Cloud cost: ~{formatCost(progress.estimated_cloud_cost)}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {progress?.current_text && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Live preview:</p>
                  <p className="text-sm italic text-muted-foreground line-clamp-2">
                    &ldquo;...{progress.current_text}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
          )}

          {/* Upload Button */}
          <Button onClick={handleUpload} disabled={!file || isProcessing} className="w-full" size="lg">
            {isUploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : isTranscribing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Transcribing...
              </>
            ) : (
              "Transcribe Audio"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Transcription Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <line x1="10" x2="8" y1="9" y2="9" />
              </svg>
              Transcription Result
              {result.provider && (
                <span className="text-xs bg-muted px-2 py-1 rounded ml-2">
                  {result.provider === "both" ? "Comparison" : result.provider.toUpperCase()}
                </span>
              )}
              {saved && (
                <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded ml-2 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Textarea value={result.text} readOnly className="min-h-[150px] resize-none pr-24" />
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyToClipboard}
                  className="h-8 px-2"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  <span className="ml-1 text-xs">{copied ? "Copied!" : "Copy"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-8 px-2"
                  title="Download transcript"
                >
                  <DownloadIcon />
                  <span className="ml-1 text-xs">Download</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {result.language && <span>Language: <strong>{result.language}</strong></span>}
              {result.duration_seconds !== undefined && (
                <span>Duration: <strong>{formatTime(result.duration_seconds)}</strong></span>
              )}
              {result.confidence !== undefined && (
                <span>Confidence: <strong>{Math.round(result.confidence * 100)}%</strong></span>
              )}
            </div>


            {/* Cost Metrics (non-comparison mode) */}
            {result.cost_metrics && !result.cloud_result && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" x2="12" y1="2" y2="22" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  Cost Analysis
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File size:</span>
                    <span>{result.cost_metrics.file_size_mb} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Audio length:</span>
                    <span>{result.cost_metrics.audio_duration_minutes.toFixed(1)} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing time:</span>
                    <span>{formatTime(result.cost_metrics.processing_time_seconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speed:</span>
                    <span>{result.cost_metrics.processing_speed_ratio.toFixed(1)}x realtime</span>
                  </div>
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Cloud API cost (OpenAI Whisper):</span>
                    <span className="text-red-500 line-through">{formatCost(result.cost_metrics.cloud_api_cost)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Local compute cost:</span>
                    <span className="text-green-600 dark:text-green-400">{formatCost(result.cost_metrics.local_compute_cost)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t border-border pt-2">
                    <span>You saved:</span>
                    <span className="text-green-600 dark:text-green-400">
                      {formatCost(result.cost_metrics.savings)} ({result.cost_metrics.savings_percentage}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comparison Result - shown when both providers were used */}
      {result && result.local_result && result.cloud_result && (
        <ComparisonResult
          localResult={result.local_result}
          cloudResult={result.cloud_result}
          audioDuration={result.duration_seconds}
          onCopy={() => {}}
          onDownload={(text, provider) => {
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file ? `${file.name.replace(/\.[^/.]+$/, "")}_${provider}_transcript.txt` : `${provider}_transcript.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
        />
      )}
    </div>
  );
}
