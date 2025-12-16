"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Transcript {
  id: string;
  user_id: string;
  file_name: string;
  file_size_bytes?: number;
  audio_duration_seconds?: number;
  text: string;
  language?: string;
  confidence?: number;
  provider?: string;
  cost_metrics?: {
    processing_time_seconds: number;
    processing_speed_ratio: number;
    cloud_api_cost: number;
    savings: number;
    savings_percentage: number;
  };
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://10.10.10.24:3085";

export default function HistoryPage() {
  const { userId } = useAuth();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pageSize = 10;

  const fetchTranscripts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/v1/transcripts?page=${page}&page_size=${pageSize}`,
        { headers: { "X-User-Id": userId } }
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setTranscripts(data.transcripts);
      setTotal(data.total);
    } catch (err) {
      setError("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => { fetchTranscripts(); }, [fetchTranscripts]);

  const handleDelete = async (id: string) => {
    if (!userId || !confirm("Delete this transcript?")) return;
    try {
      await fetch(`${API_URL}/api/v1/transcripts/${id}`, {
        method: "DELETE", headers: { "X-User-Id": userId },
      });
      setTranscripts((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) { console.error(err); }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (t: Transcript) => {
    const blob = new Blob([t.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = t.file_name.replace(/\.[^/.]+$/, "") + "_transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });

  const formatDuration = (s?: number) => {
    if (!s) return "-";
    return s < 60 ? `${Math.round(s)}s` : `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">← Back</Button>
          </Link>
          <span className="font-semibold">Transcript History</span>
          <span className="text-sm text-muted-foreground ml-auto">{total} transcripts</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {error && <Card><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>}
        
        {transcripts.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <p className="text-lg font-medium">No transcripts yet</p>
            <Link href="/"><Button className="mt-4">Transcribe Audio</Button></Link>
          </CardContent></Card>
        ) : (
          transcripts.map((t) => (
            <Card key={t.id}>
              <CardHeader 
                className="cursor-pointer hover:bg-muted/50" 
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t.file_name}</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {formatDate(t.created_at)} • {formatDuration(t.audio_duration_seconds)}
                      {t.language && ` • ${t.language.toUpperCase()}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleCopy(t.text, t.id); }}>
                      {copiedId === t.id ? "✓" : "Copy"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(t); }}>
                      Download
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedId === t.id && (
                <CardContent className="border-t pt-4">
                  <p className="text-sm whitespace-pre-wrap">{t.text}</p>
                  {t.confidence && <p className="text-xs text-muted-foreground mt-2">Confidence: {Math.round(t.confidence * 100)}%</p>}
                </CardContent>
              )}
            </Card>
          ))
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p-1)} disabled={page === 1}>Previous</Button>
            <span className="py-2 px-4">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p+1)} disabled={page === totalPages}>Next</Button>
          </div>
        )}
      </main>
    </div>
  );
}
