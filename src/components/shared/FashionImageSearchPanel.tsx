import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { importFromImage } from '@/lib/importService';
import { imageCropPixels, selectionBox, type ImageBox } from '@/lib/fashionImage';
import type { ProductCandidate } from '@/types/database';

type Detection = { id: string; category: string; label: string; confidence: number; bbox: ImageBox; color?: string | null; pattern?: string | null; brand?: string | null };
type Props = { onCandidates: (items: ProductCandidate[]) => void; onSelectedItem: (item: { category: string; brand: string; description: string }) => void; onSelectCandidate: (candidate: ProductCandidate) => void };
const categories = ['top', 'shirt', 'jacket', 'coat', 'hoodie', 'sweater', 'trousers', 'jeans', 'shorts', 'skirt', 'dress', 'suit', 'sneakers', 'shoes', 'boots', 'handbag', 'backpack', 'hat', 'jewelry', 'accessory', 'other'];

async function prepareDetectionImage(file: File): Promise<File> {
  if (file.size <= 3.8 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this image for item detection.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 3.8 * 1024 * 1024) return new File([blob], 'wishly-detection.jpg', { type: 'image/jpeg' });
    }
    throw new Error('This image is too large for automatic item detection. You can still search it or choose a manual crop.');
  } finally { bitmap.close(); }
}

export function FashionImageSearchPanel({ onCandidates, onSelectedItem, onSelectCandidate }: Props) {
  const [imageUrl, setImageUrl] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState('');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selected, setSelected] = useState<Detection | null>(null);
  const [draft, setDraft] = useState<ImageBox | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [category, setCategory] = useState('other');
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState<'idle' | 'detecting' | 'searching'>('idle');
  const [message, setMessage] = useState('Choose an image to detect and search products. Manual crop is available as a fallback.');
  const [manualSelection, setManualSelection] = useState(false);
  const [results, setResults] = useState<ProductCandidate[]>([]);
  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (cropUrl) URL.revokeObjectURL(cropUrl);
  }, [imageUrl, cropUrl]);

  const cropImage = async (file: File, box: ImageBox) => {
    const bitmap = await createImageBitmap(file);
    const source = imageCropPixels(box, bitmap.width, bitmap.height);
    if (!source) throw new Error('The selected region is too small. Draw around more of the item.');
    const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare this image crop.');
    context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let blob: Blob | null = null;
    for (const quality of [0.86, 0.72, 0.58]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 480 * 1024) break;
    }
    if (!blob || blob.size > 500 * 1024) throw new Error('This crop is too large to search. Select a smaller region.');
    const nextFile = new File([blob], 'wishly-selected-item.jpg', { type: 'image/jpeg' });
    setCropFile(nextFile);
    setCropUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob!); });
  };

  const chooseBox = async (box: ImageBox, detected?: Detection) => {
    if (!originalFile) return;
    setResults([]); onCandidates([]);
    setSelected(detected || { id: 'manual-selection', category, label: category, confidence: 1, bbox: box });
    setCropFile(null);
    setCategory(detected?.category || category);
    setBrand(detected?.brand || '');
    setStatus('detecting');
    setMessage('Preparing the selected item crop…');
    try {
      await cropImage(originalFile, box);
      onSelectedItem({ category: detected?.category || category, brand: detected?.brand || '', description: [detected?.color, detected?.pattern].filter(Boolean).join(', ') });
      setMessage(detected ? `Selected ${detected.label}. Review the crop and search it.` : 'Manual selection ready. Review the crop and search it.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not crop this item.'); }
    finally { setStatus('idle'); }
  };

  const loadImage = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
      toast.error('Choose a JPEG, PNG, or WebP image under 10 MB.');
      return;
    }
    setImageUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    setOriginalFile(file); setCropFile(null); setCropUrl(''); setDetections([]); setSelected(null); setDraft(null); setManualSelection(false); setResults([]); onCandidates([]);
    setStatus('detecting');
    setMessage('Checking for separately visible clothing items…');
    try {
      const detectorImage = await prepareDetectionImage(file);
      const form = new FormData(); form.append('image', detectorImage);
      const { data, error } = await supabase.functions.invoke('detect-fashion-items', { body: form });
      const items = Array.isArray(data?.detections) ? data.detections as Detection[] : [];
      if (!error && items.length) {
        setDetections(items);
        setManualSelection(false);
        setMessage(`Detected ${items.length} item${items.length === 1 ? '' : 's'}. Select one, or draw a region to correct it.`);
      } else {
        setMessage(data?.message || 'Automatic item detection is unavailable. Search the full image or choose manual crop as a fallback.');
      }
    } catch {
      setMessage('Automatic item detection is unavailable. Search the full image or choose manual crop as a fallback.');
    } finally { setStatus('idle'); }
  };

  const point = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
  };
  const startDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!originalFile || !manualSelection || (event.target as HTMLElement).closest('[data-detection]')) return;
    const start = point(event.clientX, event.clientY);
    if (start) { event.currentTarget.setPointerCapture(event.pointerId); setDragStart(start); setDraft(null); }
  };
  const moveDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const end = point(event.clientX, event.clientY);
    if (end) setDraft(selectionBox(dragStart.x, dragStart.y, end.x, end.y));
  };
  const endDraw = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const end = point(event.clientX, event.clientY);
    const box = end && selectionBox(dragStart.x, dragStart.y, end.x, end.y);
    setDragStart(null); setDraft(null);
    if (box) await chooseBox(box);
  };

  const findSelectedItem = async () => {
    if (!cropFile) return;
    setStatus('searching'); setMessage(`Searching visual matches for this ${category} crop…`); onCandidates([]); setResults([]);
    try {
      const result = await importFromImage(cropFile);
      setResults(result.candidates); onCandidates(result.candidates);
      setMessage(result.candidates.length ? `Found ${result.candidates.length} visual candidates. Exact matches appear first; confirm the product and variant before saving.` : 'No visual matches found. Try another detected item or search the full image.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Visual product search failed.';
      setMessage(text); toast.error(text);
    } finally { setStatus('idle'); }
  };

  const findWholeImage = async () => {
    if (!originalFile) return;
    setStatus('searching'); setMessage('Searching the full image with Google Lens…'); setResults([]); onCandidates([]);
    try {
      const result = await importFromImage(originalFile);
      setResults(result.candidates); onCandidates(result.candidates);
      setMessage(result.candidates.length ? `Found ${result.candidates.length} visual candidates. Exact matches appear first.` : 'No visual matches found. Select an item box or try manual crop.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Visual product search failed.';
      setMessage(text); toast.error(text);
    } finally { setStatus('idle'); }
  };

  return <section className="space-y-3 rounded-2xl border border-border p-4">
    <div><h2 className="text-sm font-semibold">Import products from an image</h2><p className="mt-1 text-xs text-muted-foreground">Upload a product photo, screenshot, outfit, or collage. Automatic item boxes need the configured detection model; Google Lens handles visual matching. Search the full image or select an item crop.</p></div>
    <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void loadImage(event.target.files?.[0])} disabled={status !== 'idle'} />
    {imageUrl && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
      <div ref={wrapperRef} className="relative w-full touch-none select-none" onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={(event) => void endDraw(event)} onPointerCancel={() => { setDragStart(null); setDraft(null); }}>
        <img ref={imageRef} src={imageUrl} alt="Uploaded fashion inspiration. Select or draw around one item." className="block h-auto w-full rounded-xl" draggable={false} />
        {detections.map((item) => <button key={item.id} data-detection type="button" aria-label={`Select ${item.label}`} aria-pressed={selected?.id === item.id} onClick={(event) => { event.stopPropagation(); void chooseBox(item.bbox, item); }} className={`absolute rounded-md border-2 ${selected?.id === item.id ? 'border-emerald-400 bg-emerald-400/15' : 'border-indigo-400 bg-indigo-400/10'}`} style={{ left: `${item.bbox.x * 100}%`, top: `${item.bbox.y * 100}%`, width: `${item.bbox.width * 100}%`, height: `${item.bbox.height * 100}%` }}><span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-white">{item.label} · {Math.round(item.confidence * 100)}%</span></button>)}
        {draft && <div className="pointer-events-none absolute rounded-md border-2 border-amber-400 bg-amber-300/15" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }} />}
      </div>
      <div className="space-y-2">
        <Button type="button" variant="outline" onClick={() => void findWholeImage()} disabled={status !== 'idle'} className="w-full rounded-lg"><Search className="mr-2 h-4 w-4" />Search full image</Button>
        <Button type="button" variant={manualSelection ? 'default' : 'outline'} onClick={() => setManualSelection((value) => !value)} disabled={status !== 'idle'} className="w-full rounded-lg">{manualSelection ? 'Manual crop enabled' : 'Choose manual crop (optional)'}</Button>
        {detections.length > 0 && <p className="text-[10px] text-muted-foreground">Select another box to switch items without uploading again.</p>}
        <div className="rounded-xl border border-border bg-muted/30 p-2">
          {cropUrl ? <img src={cropUrl} alt={`Selected ${category} crop`} className="aspect-square w-full rounded-lg object-contain" /> : <div className="flex aspect-square items-center justify-center text-center text-xs text-muted-foreground">Select an item box, search the full image, or enable manual crop</div>}
          {selected && <p className="mt-2 text-[10px] text-muted-foreground">{selected.label}{selected.color ? ` · ${selected.color}` : ''}{selected.pattern ? ` · ${selected.pattern}` : ''}</p>}
        </div>
        {selected && <>
          <label className="block text-[10px] text-muted-foreground">Correct item category</label>
          <select value={category} onChange={(event) => { setCategory(event.target.value); onSelectedItem({ category: event.target.value, brand, description: '' }); }} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <Input value={brand} onChange={(event) => { setBrand(event.target.value); onSelectedItem({ category, brand: event.target.value, description: '' }); }} placeholder="Brand if known" className="h-9 text-xs" />
          <Button type="button" onClick={() => void findSelectedItem()} disabled={!cropFile || status !== 'idle'} className="w-full rounded-lg">{status === 'searching' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{status === 'searching' ? 'Searching crop…' : 'Find this item'}</Button>
        </>}
      </div>
    </div>}
    {!imageUrl && <div className="flex items-center gap-2 rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground"><Upload className="h-4 w-4 shrink-0" />Upload a product image or collage to search it or select separate clothing, shoes, bags, and accessories.</div>}
    {results.length > 0 && <div className="space-y-2" aria-live="polite"><h3 className="text-xs font-semibold">Google Lens candidates</h3>{results.map((candidate, index) => <div key={`${candidate.url || candidate.title}-${index}`} className="flex items-center gap-3 rounded-xl border border-border p-2">{candidate.image_url ? <img src={candidate.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="h-12 w-12 rounded-lg bg-muted" />}<button type="button" onClick={() => { onSelectCandidate(candidate); setResults([]); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{candidate.title}</span><span className="block text-[10px] text-muted-foreground">{candidate.store || 'Web result'} · {candidate.match_reason}</span></button>{candidate.url && <a href={candidate.url} target="_blank" rel="noreferrer" className="text-[10px] text-primary">Open</a>}</div>)}</div>}
    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{status === 'detecting' ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{message}</> : message}</p>
  </section>;
}
