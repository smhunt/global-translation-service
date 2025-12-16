import { AudioUpload } from "@/components/audio-upload";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header with user button */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
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
            </div>
            <nav className="flex items-center gap-2 ml-4">
              <span className="text-sm px-3 py-1.5 bg-muted rounded-md">Transcribe</span>
              <Link href="/history" className="text-sm px-3 py-1.5 hover:bg-muted rounded-md transition-colors">
                History
              </Link>
            </nav>
          </div>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-8">
          {/* Hero */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              AI Transcription
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Privacy-first transcription powered by local models. Upload audio and get accurate transcriptions.
            </p>
          </div>

          {/* Audio Upload */}
          <AudioUpload />

          {/* Footer */}
          <footer className="text-center text-sm text-muted-foreground mt-8">
            <p>Supports 1,600+ languages with offline-capable local inference</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
