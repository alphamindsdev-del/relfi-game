import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Loader2, Image, Type, X, Upload, Check, Video, ExternalLink, Images, Wand2 } from "lucide-react";
import * as api from "../lib/api";
import { useAuth } from "../state/auth-store";
import type { ApiCategory, ApiDeck, ApiStatementCard, ApiPendingCard } from "../lib/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Rel-Fi Admin: Deck management" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const user = useAuth((s) => s.user);
  const loadSession = useAuth((s) => s.loadSession);
  const [tab, setTab] = useState<"categories" | "decks" | "cards" | "tutorial">("categories");
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [decks, setDecks] = useState<ApiDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [cards, setCards] = useState<ApiStatementCard[]>([]);
  const [pendingCards, setPendingCards] = useState<ApiPendingCard[]>([]);
  const [uploading, setUploading] = useState(false);
  const [convertingPendingId, setConvertingPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCard, setEditingCard] = useState<Partial<ApiStatementCard> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<ApiCategory> | null>(null);
  const [editingDeck, setEditingDeck] = useState<Partial<ApiDeck> | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSession() }, [loadSession])

  useEffect(() => {
    if (!user || user.role !== 'admin') { setLoading(false); return }
    Promise.all([
      api.getCategories().then(setCategories).catch(() => {}),
      api.getDecks().then(setDecks).catch(() => {}),
    ]).then(() => setLoading(false))
  }, [user])

  useEffect(() => {
    if (selectedDeckId) {
      api.getDeck(selectedDeckId).then((d) => setCards(d.cards || [])).catch(() => {})
      api.getPendingCards(selectedDeckId).then(setPendingCards).catch(() => setPendingCards([]))
    } else {
      setCards([])
      setPendingCards([])
    }
  }, [selectedDeckId])

  if (!user) {
    return (
      <div className="relfi-root min-h-screen bg-hero flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to access admin.</p>
      </div>
    )
  }

  if (user.role !== 'admin') {
    return (
      <div className="relfi-root min-h-screen bg-hero flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="relfi-root min-h-screen bg-hero flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  async function saveCard() {
    if (!editingCard || !selectedDeckId) return
    try {
      if (convertingPendingId) {
        const created = await api.convertPendingCard(selectedDeckId, convertingPendingId, editingCard as any)
        setCards((cs) => [...cs, created])
        setPendingCards((ps) => ps.filter((p) => p.id !== convertingPendingId))
        setConvertingPendingId(null)
        setEditingCard(null)
        return
      }
      if (editingCard.id) {
        const updated = await api.updateCard(selectedDeckId, editingCard.id, editingCard)
        setCards((cs) => cs.map((c) => c.id === updated.id ? updated : c))
      } else {
        const created = await api.createCard(selectedDeckId, editingCard as any)
        setCards((cs) => [...cs, created])
      }
      setEditingCard(null)
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function deleteCard(cardId: string) {
    if (!selectedDeckId) return
    try {
      await api.deleteCard(selectedDeckId, cardId)
      setCards((cs) => cs.filter((c) => c.id !== cardId))
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleBulkImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedDeckId) return
    setUploading(true)
    try {
      const result = await api.uploadBulkStatementImages(selectedDeckId, Array.from(files))
      setPendingCards((ps) => [...result.cards, ...ps])
      alert(`${result.imported} statement image${result.imported === 1 ? '' : 's'} uploaded. Click "Set up" on each to assign its answer and clue.`)
    } catch (e: any) {
      alert(e.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function deletePendingCard(pendingId: string) {
    if (!selectedDeckId) return
    try {
      await api.deletePendingCard(selectedDeckId, pendingId)
      setPendingCards((ps) => ps.filter((p) => p.id !== pendingId))
    } catch (e: any) {
      alert(e.message)
    }
  }

  function setUpPendingCard(p: ApiPendingCard) {
    setConvertingPendingId(p.id)
    setEditingCard({
      statement_image_url: p.statement_image_url,
      statement_text: '',
      correct_category_id: categories[0]?.id || '',
      clue_variant: 'none',
      clue_type: 'none',
      clue_content: '',
      difficulty: 'medium',
    })
  }

  async function saveCategory() {
    if (!editingCategory) return
    try {
      if (editingCategory.id) {
        const updated = await api.updateCategory(editingCategory.id, editingCategory)
        setCategories((cs) => cs.map((c) => c.id === updated.id ? updated : c))
      } else {
        const created = await api.createCategory(editingCategory as any)
        setCategories((cs) => [...cs, created])
      }
      setEditingCategory(null)
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function deleteCategory(id: string) {
    try {
      await api.deleteCategory(id)
      setCategories((cs) => cs.filter((c) => c.id !== id))
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function saveDeck() {
    if (!editingDeck) return
    try {
      if (editingDeck.id) {
        const updated = await api.updateDeck(editingDeck.id, editingDeck)
        setDecks((ds) => ds.map((d) => d.id === updated.id ? updated : d))
      } else {
        const created = await api.createDeck(editingDeck as any)
        setDecks((ds) => [...ds, created])
      }
      setEditingDeck(null)
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function publishDeck(deckId: string) {
    try {
      await api.publishDeck(deckId)
      setDecks((ds) => ds.map((d) => d.id === deckId ? { ...d, is_published: 1 } : d))
    } catch (e: any) {
      alert(e.message)
    }
  }

  const selectedDeck = decks.find((d) => d.id === selectedDeckId)

  return (
    <div className="relfi-root min-h-screen bg-hero">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to game
            </Link>
            <div className="hidden font-display text-lg font-bold sm:block">Rel-Fi Admin</div>
          </div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {user.display_name} (admin)
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex gap-2">
          {(["categories", "decks", "cards", "tutorial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold uppercase tracking-widest ${
                tab === t ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "categories" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">Categories ({categories.length})</div>
              <button
                onClick={() => setEditingCategory({ name: '', color_hex: '#8B5CF6', short_code: '', icon_key: '', definition: '' })}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> New category
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
                  <div className="h-10 w-10 rounded-full shrink-0" style={{ background: c.color_hex }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-lg font-bold">{c.name} {c.short_code && <span className="text-xs text-muted-foreground">({c.short_code})</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.definition}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingCategory(c)} className="p-1 text-muted-foreground hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteCategory(c.id)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "decks" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">Decks ({decks.length})</div>
              <button
                onClick={() => setEditingDeck({ title: '', description: '' })}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> New deck
              </button>
            </div>
            <div className="space-y-3">
              {decks.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-2xl border bg-card p-4 cursor-pointer transition ${selectedDeckId === d.id ? 'border-primary' : 'hover:bg-card/80'}`}
                  onClick={() => { setSelectedDeckId(d.id); setTab('cards') }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display text-lg font-bold">{d.title}</div>
                      {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">{d.card_count || 0} cards</div>
                      {!d.is_published ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); publishDeck(d.id) }}
                          className="rounded-full border px-3 py-1 text-xs font-semibold hover:bg-card"
                        >
                          Publish
                        </button>
                      ) : (
                        <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">Published</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setEditingDeck(d) }} className="p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "cards" && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="rounded-xl border bg-background/50 px-4 py-2 text-sm"
              >
                <option value="">Select a deck...</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
              {selectedDeck && (
                <div className="text-xs text-muted-foreground">{cards.length} cards</div>
              )}
              {selectedDeckId && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => bulkFileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold text-foreground hover:bg-card disabled:opacity-50"
                    title="Upload statement images in bulk"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
                    Upload image cards
                  </button>
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleBulkImageUpload}
                  />
                  <button
                    onClick={() => setEditingCard({ statement_text: '', statement_image_url: '', correct_category_id: categories[0]?.id, clue_variant: 'none', clue_type: 'none', clue_content: '', difficulty: 'medium' })}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground"
                  >
                    <Plus className="h-4 w-4" /> New card
                  </button>
                </div>
              )}
            </div>

            {selectedDeckId && pendingCards.length > 0 && (
              <div className="mb-6 rounded-3xl border border-amber-400/30 bg-amber-500/5 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-display text-lg font-bold text-amber-300">
                    <Wand2 className="h-4 w-4" />
                    Pending image cards ({pendingCards.length}) — assign answer & clue
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {pendingCards.map((p) => (
                    <div key={p.id} className="overflow-hidden rounded-2xl border bg-card">
                      <div className="aspect-[4/5] w-full bg-muted/30">
                        <img src={p.statement_image_url} alt={p.filename || 'pending card'} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex items-center justify-between p-2">
                        <span className="truncate pr-1 text-xs text-muted-foreground">{p.filename || 'image'}</span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => setUpPendingCard(p)}
                            className="rounded-full bg-primary-gradient px-2.5 py-1 text-xs font-bold text-primary-foreground"
                          >
                            Set up
                          </button>
                          <button onClick={() => deletePendingCard(p.id)} className="rounded-full p-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDeckId && (
              <div className="rounded-3xl border bg-card">
                <table className="w-full">
                  <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left font-normal">Statement</th>
                      <th className="p-3 text-left font-normal">Answer</th>
                      <th className="p-3 text-left font-normal">Clue</th>
                      <th className="p-3 text-right font-normal">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((c) => {
                      const ans = categories.find((cat) => cat.id === c.correct_category_id);
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="max-w-md p-3">
                            {c.statement_image_url ? (
                              <div className="flex items-center gap-2">
                                <img src={c.statement_image_url} alt="Statement" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                                {c.statement_text ? (
                                  <span className="truncate text-xs text-muted-foreground">{c.statement_text}</span>
                                ) : (
                                  <span className="truncate text-xs uppercase tracking-widest text-muted-foreground">Image card</span>
                                )}
                              </div>
                            ) : (
                              <span className="truncate">{c.statement_text}</span>
                            )}
                          </td>
                          <td className="p-3">
                            {ans ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                                style={{
                                  background: `${ans.color_hex}22`,
                                  color: ans.color_hex,
                                  border: `1px solid ${ans.color_hex}66`,
                                }}
                              >
                                {ans.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-400">
                                Unassigned
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs uppercase tracking-widest text-muted-foreground">
                            {c.clue_type === 'text' ? 'Text' : c.clue_type === 'image' ? 'Image' : c.clue_variant}
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => setEditingCard(c)} className="mr-2 text-muted-foreground hover:text-foreground">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteCard(c.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {cards.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">No cards yet. Create your first card.</p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "tutorial" && <TutorialTab />}
      </div>

      {editingCard && (
        <CardEditorModal
          card={editingCard}
          categories={categories}
          onClose={() => setEditingCard(null)}
          onSave={saveCard}
        />
      )}

      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur md:items-center">
          <div className="w-full max-w-lg rounded-t-3xl border bg-card p-6 md:rounded-3xl">
            <div className="mb-4 font-display text-xl font-bold">
              {editingCategory.id ? "Edit category" : "New category"}
            </div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Name</label>
            <input
              value={editingCategory.name || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Short code</label>
                <input
                  value={editingCategory.short_code || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, short_code: e.target.value })}
                  className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Color</label>
                <input
                  type="color"
                  value={editingCategory.color_hex || '#8B5CF6'}
                  onChange={(e) => setEditingCategory({ ...editingCategory, color_hex: e.target.value })}
                  className="mt-1 h-11 w-full rounded-2xl border bg-background/50 p-1 outline-none focus:border-primary"
                />
              </div>
            </div>
            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Definition</label>
            <textarea
              value={editingCategory.definition || ''}
              onChange={(e) => setEditingCategory({ ...editingCategory, definition: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditingCategory(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
              <button onClick={saveCategory} className="rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground">Save</button>
            </div>
          </div>
        </div>
      )}

      {editingDeck && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur md:items-center">
          <div className="w-full max-w-lg rounded-t-3xl border bg-card p-6 md:rounded-3xl">
            <div className="mb-4 font-display text-xl font-bold">
              {editingDeck.id ? "Edit deck" : "New deck"}
            </div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Title</label>
            <input
              value={editingDeck.title || ''}
              onChange={(e) => setEditingDeck({ ...editingDeck, title: e.target.value })}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Description</label>
            <textarea
              value={editingDeck.description || ''}
              onChange={(e) => setEditingDeck({ ...editingDeck, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditingDeck(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
              <button onClick={saveDeck} className="rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardEditorModal({
  card,
  categories,
  onClose,
  onSave,
}: {
  card: Partial<ApiStatementCard>;
  categories: ApiCategory[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [clueType, setClueType] = useState(card.clue_type || 'none');
  const [clueContent, setClueContent] = useState(card.clue_content || '');
  const [imagePreview, setImagePreview] = useState<string | null>(
    card.clue_type === 'image' ? card.clue_content || null : null
  );
  const [statementImageUrl, setStatementImageUrl] = useState<string | null>(
    card.statement_image_url || null
  );
  const [statementUploading, setStatementUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statementFileInputRef = useRef<HTMLInputElement>(null);

  const currentCard = {
    ...card,
    clue_type: clueType,
    clue_content: clueContent,
  };

  function handleClueTypeChange(type: 'none' | 'text' | 'image') {
    setClueType(type);
    if (type === 'none') {
      setClueContent('');
      setImagePreview(null);
    } else if (type === 'image') {
      setClueContent('');
    }
  }

  async function handleStatementImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.');
      return;
    }

    setStatementUploading(true);
    try {
      const result = await api.uploadStatementImage(file);
      setStatementImageUrl(result.url);
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setStatementUploading(false);
      e.target.value = '';
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadClueImage(file);
      setClueContent(result.url);
      setImagePreview(result.url);
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleSave() {
    card.clue_type = clueType;
    card.clue_content = clueContent;
    card.statement_image_url = statementImageUrl || undefined;
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur md:items-center">
      <div className="w-full max-w-lg rounded-t-3xl border bg-card p-6 md:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6 font-display text-xl font-bold">
          {card.id ? "Edit card" : "New card"}
        </div>

        {/* Statement image (optional) */}
        <label className="text-xs uppercase tracking-widest text-muted-foreground">Statement image (optional)</label>
        <div
          onClick={() => statementFileInputRef.current?.click()}
          className={`mt-1 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 transition ${
            statementImageUrl ? 'border-primary/30 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
          }`}
        >
          {statementImageUrl ? (
            <div className="relative w-full">
              <img
                src={statementImageUrl}
                alt="Statement preview"
                className="h-auto max-h-48 w-full rounded-xl object-contain"
              />
              <button
                onClick={(e) => { e.stopPropagation(); setStatementImageUrl(null); }}
                className="absolute -right-2 -top-2 rounded-full border bg-card p-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              {statementUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <>
                  <Image className="h-8 w-8" />
                  <span className="text-sm font-medium">Click to upload the statement as an image</span>
                  <span className="text-xs">PNG, JPG, GIF, WebP (max 5MB) — keeps the image's aspect ratio</span>
                </>
              )}
            </div>
          )}
        </div>
        <input
          ref={statementFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleStatementImageUpload}
        />

        {/* Statement text (used when no statement image is set) */}
        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">
          Statement text {statementImageUrl ? '(optional)' : ''}
        </label>
        <textarea
          value={card.statement_text || ''}
          onChange={(e) => { card.statement_text = e.target.value }}
          rows={3}
          placeholder={statementImageUrl ? 'Optional caption for the image...' : 'Enter the statement...'}
          className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary resize-none"
        />

        {/* Correct category */}
        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">Correct category</label>
        <select
          value={card.correct_category_id || ''}
          onChange={(e) => { card.correct_category_id = e.target.value }}
          className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Difficulty */}
        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">Difficulty</label>
        <div className="mt-1 flex gap-2">
          {['easy', 'medium', 'hard'].map((d) => (
            <button
              key={d}
              onClick={() => { card.difficulty = d as any }}
              className={`flex-1 rounded-xl border py-2 text-xs font-semibold uppercase tracking-widest transition ${
                (card.difficulty || 'medium') === d
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Clue type selector */}
        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">Clue</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            { value: 'none', label: 'None', icon: X },
            { value: 'text', label: 'Text', icon: Type },
            { value: 'image', label: 'Image', icon: Image },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleClueTypeChange(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-4 transition ${
                clueType === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              <opt.icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Clue content */}
        {clueType === 'text' && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Clue text</label>
            <textarea
              value={clueContent}
              onChange={(e) => setClueContent(e.target.value)}
              rows={3}
              placeholder="Enter the clue text the Seer will see..."
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary resize-none"
            />
          </div>
        )}

        {clueType === 'image' && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Clue image</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`mt-1 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition ${
                imagePreview ? 'border-primary/30 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {imagePreview ? (
                <div className="relative w-full">
                  <img
                    src={imagePreview}
                    alt="Clue preview"
                    className="h-auto max-h-48 w-full rounded-xl object-contain"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setImagePreview(null); setClueContent('') }}
                    className="absolute -right-2 -top-2 rounded-full border bg-card p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8" />
                      <span className="text-sm font-medium">Click to upload</span>
                      <span className="text-xs">PNG, JPG, GIF, WebP (max 5MB)</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
        )}

        {/* Friction explanation */}
        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">Friction explanation</label>
        <textarea
          value={card.friction_explanation || ''}
          onChange={(e) => { card.friction_explanation = e.target.value }}
          rows={2}
          placeholder="Explained on the reveal screen..."
          className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary resize-none"
        />

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border px-5 py-2.5 text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={clueType === 'image' && uploading}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {card.id ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorialTab() {
  const [uploading, setUploading] = useState(false)
  const [tutorialInfo, setTutorialInfo] = useState<{ exists: boolean; url?: string; filename?: string; uploadedAt?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getTutorialInfo()
      .then(setTutorialInfo)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      setMessage('Please select a video file.')
      return
    }

    if (file.size > 99 * 1024 * 1024) {
      setMessage('Video must be under 99MB.')
      return
    }

    setUploading(true)
    setMessage("")
    try {
      const result = await api.uploadTutorial(file)
      setTutorialInfo({ exists: true, ...result, url: api.TUTORIAL_VIDEO_URL })
      setMessage('Tutorial uploaded successfully!')
    } catch (e: any) {
      setMessage(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="font-display text-lg font-bold">Tutorial Video</div>
      </div>

      <div className="rounded-3xl border bg-card p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Video className="h-8 w-8 text-primary" />
            <div>
              <div className="font-semibold">How-to-play video</div>
              <div className="text-xs text-muted-foreground">
                {tutorialInfo?.exists
                  ? `Current: ${tutorialInfo.filename} (uploaded ${new Date(tutorialInfo.uploadedAt!).toLocaleDateString()})`
                  : 'No tutorial uploaded yet'}
              </div>
            </div>
          </div>

          {tutorialInfo?.exists && tutorialInfo.url && (
            <div className="max-w-lg aspect-video rounded-xl overflow-hidden border bg-black">
              <video className="h-full w-full" controls>
                <source src={tutorialInfo.url} type={tutorialInfo.url!.endsWith('.webm') ? 'video/webm' : tutorialInfo.url!.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
              </video>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition ${
              uploading ? 'border-primary/30 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">
                  {tutorialInfo?.exists ? 'Replace tutorial video' : 'Upload tutorial video'}
                </span>
                <span className="text-xs">MP4, WebM, MOV (max 99MB)</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleUpload}
          />

          {message && (
            <div className={`text-sm ${message.includes('success') ? 'text-green-500' : 'text-destructive'}`}>
              {message}
            </div>
          )}

          {tutorialInfo?.exists && (
            <a
              href={tutorialInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Open video directly
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
