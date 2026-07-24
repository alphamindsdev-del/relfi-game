import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import * as api from "../lib/api";
import { useAuth } from "../state/auth-store";
import type { ApiCategory, ApiDeck, ApiStatementCard } from "../lib/types";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Rel-Fi Admin — Deck management" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const user = useAuth((s) => s.user);
  const loadSession = useAuth((s) => s.loadSession);
  const [tab, setTab] = useState<"categories" | "decks" | "cards">("categories");
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [decks, setDecks] = useState<ApiDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [cards, setCards] = useState<ApiStatementCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCard, setEditingCard] = useState<Partial<ApiStatementCard> | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<ApiCategory> | null>(null);
  const [editingDeck, setEditingDeck] = useState<Partial<ApiDeck> | null>(null);

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
          {(["categories", "decks", "cards"] as const).map((t) => (
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
                <button
                  onClick={() => setEditingCard({ statement_text: '', correct_category_id: categories[0]?.id, clue_variant: 'none', difficulty: 'medium' })}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> New card
                </button>
              )}
            </div>

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
                          <td className="max-w-md truncate p-3">{c.statement_text}</td>
                          <td className="p-3">
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                              style={{
                                background: `${ans?.color_hex}22`,
                                color: ans?.color_hex,
                                border: `1px solid ${ans?.color_hex}66`,
                              }}
                            >
                              {ans?.name}
                            </span>
                          </td>
                          <td className="p-3 text-xs uppercase tracking-widest text-muted-foreground">{c.clue_variant}</td>
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
      </div>

      {editingCard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur md:items-center">
          <div className="w-full max-w-lg rounded-t-3xl border bg-card p-6 md:rounded-3xl">
            <div className="mb-4 font-display text-xl font-bold">
              {editingCard.id ? "Edit card" : "New card"}
            </div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Statement text</label>
            <textarea
              value={editingCard.statement_text || ''}
              onChange={(e) => setEditingCard({ ...editingCard, statement_text: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Correct category</label>
            <select
              value={editingCard.correct_category_id || ''}
              onChange={(e) => setEditingCard({ ...editingCard, correct_category_id: e.target.value })}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Clue variant</label>
            <select
              value={editingCard.clue_variant || 'none'}
              onChange={(e) => setEditingCard({ ...editingCard, clue_variant: e.target.value as any })}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            >
              <option value="none">None</option>
              <option value="narrowed_list">Narrowed List</option>
              <option value="partial_text">Partial Text</option>
              <option value="exact_answer">Exact Answer</option>
            </select>
            <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Friction explanation</label>
            <textarea
              value={editingCard.friction_explanation || ''}
              onChange={(e) => setEditingCard({ ...editingCard, friction_explanation: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-2xl border bg-background/50 p-3 outline-none focus:border-primary"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditingCard(null)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
              <button onClick={saveCard} className="rounded-full bg-primary-gradient px-4 py-2 text-sm font-bold text-primary-foreground">Save</button>
            </div>
          </div>
        </div>
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
