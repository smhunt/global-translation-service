"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Transcript {
  id: string;
  user_id: string;
  file_name: string;
  file_size_bytes: number;
  audio_duration_seconds: number | null;
  text: string;
  language: string | null;
  confidence: number | null;
  provider: string | null;
  cost_metrics: Record<string, number> | null;
  created_at: string;
}

interface TranscriptListResponse {
  transcripts: Transcript[];
  total: number;
  page: number;
  page_size: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://10.10.10.24:3085";

export default function HistoryPage() {
  const { userId, isLoaded } = useAuth();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const pageSize = 10;

  const fetchTranscripts = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/v1/transcripts?page=${page}&page_size=${pageSize}`,
        {
          headers: {
            "X-User-Id": userId,
          },
        }
      );

      if (response.status === 503) {
        setHistoryAvailable(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch transcripts");
      }

      const data: TranscriptListResponse = await response.json();
      setTranscripts(data.transcripts);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    if (isLoaded && userId) {
      fetchTranscripts();
    }
  }, [isLoaded, userId, fetchTranscripts]);

  const handleDelete = async (id: string) => {
    if (!userId || !confirm("Delete this transcript?")) return;

    try {
      const response = await fetch(`${API_URL}/api/v1/transcripts/${id}`, {
        method: "DELETE",
        headers: {
          "X-User-Id": userId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      setTranscripts((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      alert("Failed to delete transcript");
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const totalPages = Math.ceil(total / pageSize);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80">
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
              <span className="font-semibold">TranscribeGlobal</span>
            </Link>
            <nav className="flex items-center gap-2 ml-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  Transcribe
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className="bg-muted">
                History
              </Button>
            </nav>
          </div>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Transcript History</h1>

          {!historyAvailable ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Transcript history is not available. Please configure Supabase.
                </p>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Loading transcripts...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-destructive">{error}</p>
                <Button onClick={fetchTranscripts} className="mt-4">
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : transcripts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No transcripts yet.</p>
                <Link href="/">
                  <Button className="mt-4">Create your first transcript</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {transcripts.map((transcript) => (
                <Card key={transcript.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-medium">
                          {transcript.file_name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(transcript.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {transcript.provider && (
                          <span className="text-xs bg-muted px-2 py-1 rounded">
                            {transcript.provider.toUpperCase()}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(transcript.id)}
                          className="text-destructive hover:text-destructive"
                        >
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
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3">
                      <span>Size: {formatFileSize(transcript.file_size_bytes)}</span>
                      {transcript.audio_duration_seconds && (
                        <span>Duration: {formatTime(transcript.audio_duration_seconds)}</span>
                      )}
                      {transcript.language && <span>Language: {transcript.language}</span>}
                      {transcript.confidence && (
                        <span>Confidence: {Math.round(transcript.confidence * 100)}%</span>
                      )}
                    </div>

                    <div
                      className={`text-sm ${
                        expandedId === transcript.id ? "" : "line-clamp-3"
                      }`}
                    >
                      {transcript.text}
                    </div>

                    {transcript.text.length > 200 && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto mt-2"
                        onClick={() =>
                          setExpandedId(
                            expandedId === transcript.id ? null : transcript.id
                          )
                        }
                      >
                        {expandedId === transcript.id ? "Show less" : "Show more"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
