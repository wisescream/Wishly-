import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importFromImage } from "@/lib/importService";
import type { ProductCandidate } from "@/types/database";

type Props = { onCandidates: (items: ProductCandidate[]) => void };

export function ProductImageSearchPanel({ onCandidates }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Search a clear product photo or screenshot with Google Lens.");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const chooseFile = (next?: File) => {
    onCandidates([]);
    setFile(next || null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return next ? URL.createObjectURL(next) : "";
    });
    setMessage(next ? "Review the image, then search for visual matches." : "Search a clear product photo or screenshot with Google Lens.");
  };

  const search = async () => {
    if (!file) return;
    setBusy(true);
    onCandidates([]);
    setMessage("Searching visual matches…");
    try {
      const result = await importFromImage(file);
      onCandidates(result.candidates);
      setMessage(result.candidates.length
        ? `Found ${result.candidates.length} visual candidates. Confirm the exact model and variant before saving.`
        : "No visual matches were returned. Try a closer image or search by product name.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Image search failed.";
      setMessage(text);
      toast.error(text);
    } finally { setBusy(false); }
  };

  return <section className="space-y-3 rounded-2xl border border-border p-4">
    <div>
      <h2 className="text-sm font-semibold">Search a product photo</h2>
      <p className="mt-1 text-xs text-muted-foreground">Wishly sends the selected image to its configured Google Lens provider. Results are visual candidates, not confirmed product matches or prices.</p>
    </div>
    <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} disabled={busy} />
    {preview && <img src={preview} alt="Selected product image" className="max-h-72 max-w-full rounded-xl object-contain" />}
    <Button type="button" onClick={() => void search()} disabled={!file || busy} className="w-full rounded-lg">
      {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Searching image…</> : <><Search className="mr-2 h-4 w-4" />Find visual matches</>}
    </Button>
    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{message}</p>
  </section>;
}
