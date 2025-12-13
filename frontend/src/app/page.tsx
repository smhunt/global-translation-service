import { AudioUpload } from "@/components/audio-upload";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              TranscribeGlobal
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Privacy-first AI transcription. Upload audio and get accurate transcriptions powered by local models.
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
