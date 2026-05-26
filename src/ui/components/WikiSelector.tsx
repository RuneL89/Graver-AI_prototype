import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import {
  listWikis,
  createWiki,
  deleteWiki,
  refreshWikiManifest,
  type WikiManifest,
} from '../../workbench/predigestor/wikiStore';

interface WikiSelectorProps {
  selectedWikiId: string | null;
  onSelectWiki: (id: string | null) => void;
}

export default function WikiSelector({ selectedWikiId, onSelectWiki }: WikiSelectorProps) {
  const [wikis, setWikis] = useState<WikiManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const loadWikis = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listWikis();
      setWikis(all);
    } catch (err) {
      console.error('Failed to load wikis:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWikis();
  }, [loadWikis]);

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled Wiki';
    const id = await createWiki(name);
    setNewName('');
    setShowCreate(false);
    await loadWikis();
    onSelectWiki(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this wiki and all its data? This cannot be undone.')) return;
    await deleteWiki(id);
    if (selectedWikiId === id) {
      onSelectWiki(null);
    }
    await loadWikis();
  };

  const handleRefresh = async (id: string) => {
    await refreshWikiManifest(id);
    await loadWikis();
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Wiki Selector</h2>
        </div>
        <button
          onClick={loadWikis}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {wikis.length === 0 && !showCreate && (
        <p className="text-sm text-muted-foreground mb-4">
          No wikis yet. Create one to start ingesting documents.
        </p>
      )}

      {wikis.length > 0 && (
        <ul className="space-y-2 mb-4">
          {wikis.map((wiki) => (
            <li
              key={wiki.id}
              className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                selectedWikiId === wiki.id
                  ? 'bg-primary/10 border-primary'
                  : 'border-border hover:bg-accent/50'
              }`}
              onClick={() => onSelectWiki(wiki.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{wiki.name}</div>
                <div className="text-xs text-muted-foreground">
                  {wiki.pageCount} pages · {wiki.sourceCount} sources ·{' '}
                  {new Date(wiki.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRefresh(wiki.id);
                  }}
                  className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Refresh counts"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(wiki.id);
                  }}
                  className="p-1.5 rounded hover:bg-red-900/30 text-muted-foreground hover:text-red-400"
                  title="Delete wiki"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-2 rounded border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create New Wiki
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Wiki name..."
            autoFocus
            className="flex-1 px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium"
          >
            Create
          </button>
          <button
            onClick={() => {
              setShowCreate(false);
              setNewName('');
            }}
            className="px-4 py-2 rounded border border-border text-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
