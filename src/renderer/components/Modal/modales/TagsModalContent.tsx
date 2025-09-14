// Liste les tages et propose un bouton pour en ajouter et chaque tag a un bouton supprimer et un bouton modifier
// Il faut bien respecter les types, l'ajout et la modification doivent se faire via un formulaire
// Quand on clique sur un tag il s'agrandir pour montrer le formulaire de modification à l'interieur
// L'ajout met direct un tag vide et l'ouvre en mode modification (si vide à la fermeture on ne l'ajoute pas)
// Dans la modif il y a un champ texte pour le nom et un checkbox pour la propriété hidden
// Le formulaire de modif a un bouton sauvegarder
// Ne pas utiliser le component Form pour ce form là, faire un form classique

import React, { useState, useEffect, useRef } from 'react';
import '@/renderer/components/Modal/style.scss';
import './TagsModalContent.scss';
import useTags from '@/renderer/hooks/useTags';
import generateId from '@/utils/id';
import { Tag } from '@/renderer/types';

type TempTag = {
  tempId: string;
  name: string;
  hidden?: boolean;
};

export default function TagsModalContent() {
  const { tags, addTag, removeTag, updateTag } = useTags();

  // temp tags created by the user but not yet persisted
  const [tempTags, setTempTags] = useState<TempTag[]>([]);

  // id of the tag currently being edited (existing tag) or null
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{ name: string; hidden?: boolean } | null>(null);

  // temp editing state (for unsaved new tags)
  const [editingTempId, setEditingTempId] = useState<string | null>(null);

  // refs to tag DOM nodes so we can detect outside clicks
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // clicking outside an editing tag should cancel editing
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (editingId) {
        const el = itemRefs.current[editingId];
        if (!el || !el.contains(target)) {
          handleCancelEditExisting();
        }
        return;
      }

      if (editingTempId) {
        const el = itemRefs.current[editingTempId];
        if (!el || !el.contains(target)) {
          handleCancelTemp(editingTempId);
        }
        return;
      }
    };

    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [editingId, editingTempId]);

  // keep temp tags if context `tags` updates (do nothing special)
  useEffect(() => {
    // no-op for now; tags come from context and merge with tempTags in render
  }, [tags]);

  const handleAdd = () => {
    const tempId = `tmp-${generateId()}`;
    const newTemp: TempTag = { tempId, name: '', hidden: false };
    setTempTags((s) => [newTemp, ...s]);
    setEditingTempId(tempId);
  };

  const handleRemoveExisting = async (id: string) => {
    await removeTag(id);
  };

  const handleStartEditExisting = (t: Tag) => {
    setEditingId(t.id);
    setEditingDraft({ name: t.name || '', hidden: !!t.hidden });
  };

  const handleCancelEditExisting = () => {
    setEditingId(null);
    setEditingDraft(null);
  };

  const handleSaveExisting = async (id: string) => {
    if (!editingDraft) return;
    const updated: Tag = { id, name: editingDraft.name.trim(), hidden: !!editingDraft.hidden, createdAt: (tags.find(t=>t.id===id)?.createdAt) || new Date().toISOString() };
    await updateTag(updated);
    setEditingId(null);
    setEditingDraft(null);
  };

  const handleChangeDraft = (field: 'name' | 'hidden', value: string | boolean) => {
    setEditingDraft((d) => (d ? { ...d, [field]: value } : { name: '', hidden: false }));
  };

  // Temp tag handlers
  const handleChangeTemp = (tempId: string, field: 'name' | 'hidden', value: string | boolean) => {
    setTempTags((s) => s.map(t => t.tempId === tempId ? { ...t, [field]: value } : t));
  };

  const handleCancelTemp = (tempId: string) => {
    // if empty name, just remove; otherwise also remove (per requirements)
    setTempTags((s) => s.filter(t => t.tempId !== tempId));
    if (editingTempId === tempId) setEditingTempId(null);
  };

  const handleSaveTemp = async (tempId: string) => {
    const temp = tempTags.find(t => t.tempId === tempId);
    if (!temp) return;
    const name = (temp.name || '').trim();
    if (!name) {
      // empty -> do not add
      setTempTags((s) => s.filter(t => t.tempId !== tempId));
      setEditingTempId(null);
      return;
    }
    // call context addTag
    await addTag({ name, hidden: !!temp.hidden });
    // clear the temp list (context tags will include the new one)
    setTempTags((s) => s.filter(t => t.tempId !== tempId));
    setEditingTempId(null);
  };

  return (
    <div className="tags-modal-content">
      <div className='tags-header'>
        <button type="button" onClick={handleAdd} className="btn btn-primary">Ajouter</button>
      </div>

      <div className="tags-list">
        {/* Render temp tags first (unsaved) */}
        {tempTags.map((t) => (
          <div
            key={t.tempId}
            className={`tag-item ${editingTempId === t.tempId ? 'editing' : ''}`}
            ref={(el) => { itemRefs.current[t.tempId] = el; }}
          >
            <div
              className="tag-header"
              onClick={() => setEditingTempId((prev) => (prev === t.tempId ? null : t.tempId))}
            >
              {editingTempId === t.tempId ? (
                <>
                  <input
                    className="tag-title-input"
                    autoFocus
                    value={t.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleChangeTemp(t.tempId, 'name', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveTemp(t.tempId);
                      }
                    }}
                  />
                  <input
                    className="tag-hidden-checkbox"
                    type="checkbox"
                    checked={!!t.hidden}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleChangeTemp(t.tempId, 'hidden', e.target.checked)}
                  />
                </>
              ) : (
                <strong className="tag-title">{t.name || <em>(nouveau tag)</em>}{t.hidden ? <span className="tag-ghost" title="Masqué"> 👻</span> : null}</strong>
              )}

              <div className="tag-actions">
                {editingTempId === t.tempId ? (
                  // in edit mode show a check button to validate
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSaveTemp(t.tempId); }}
                    className="icon-btn icon-btn--confirm"
                    title="Valider"
                  >
                    ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleCancelTemp(t.tempId); }}
                    className="icon-btn icon-btn--transparent"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Existing tags from context */}
        {tags.map((tag) => (
          <div
            key={tag.id}
            className={`tag-item ${editingId === tag.id ? 'editing' : ''}`}
            ref={(el) => { itemRefs.current[tag.id] = el; }}
          >
            <div
              className="tag-header"
              onClick={() => { if (editingId === tag.id) handleCancelEditExisting(); else handleStartEditExisting(tag); }}
            >
              {editingId === tag.id && editingDraft ? (
                <>
                  <input
                    className="tag-title-input"
                    autoFocus
                    value={editingDraft.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleChangeDraft('name', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSaveExisting(tag.id);
                      }
                    }}
                  />
                  <input
                    className="tag-hidden-checkbox"
                    type="checkbox"
                    checked={!!editingDraft.hidden}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleChangeDraft('hidden', e.target.checked)}
                  />
                </>
              ) : (
                <strong className="tag-title">{tag.name}{tag.hidden ? <span className="tag-ghost" title="Masqué"> 👻</span> : null}</strong>
              )}

              <div className="tag-actions">
                {editingId === tag.id ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSaveExisting(tag.id); }}
                    className="icon-btn icon-btn--confirm"
                    title="Valider"
                  >
                    ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveExisting(tag.id); }}
                    className="icon-btn icon-btn--transparent"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
