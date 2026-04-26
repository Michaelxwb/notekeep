import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback, useRef } from 'react';

export interface NoteItem {
  id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'note';
  date: string | null;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  name: string;
  date: string | null;
  snippet: string;
}

export function useNotes() {
  const loadingCount = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOp = useCallback(() => {
    loadingCount.current += 1;
    setLoading(true);
  }, []);

  const endOp = useCallback(() => {
    loadingCount.current = Math.max(0, loadingCount.current - 1);
    if (loadingCount.current === 0) setLoading(false);
  }, []);

  const createItem = useCallback(async (
    parentId: string | null,
    name: string,
    itemType: 'folder' | 'note',
    date?: string
  ): Promise<string> => {
    startOp();
    setError(null);
    try {
      return await invoke<string>('create_item', {
        parentId,
        name,
        itemType,
        date: date ?? null,
      });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const getItem = useCallback(async (id: string): Promise<NoteItem | null> => {
    setError(null);
    try {
      return await invoke<NoteItem | null>('get_item', { id });
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const updateItem = useCallback(async (
    id: string,
    name?: string,
    content?: string,
    date?: string
  ): Promise<void> => {
    startOp();
    setError(null);
    try {
      await invoke('update_item', {
        id,
        name: name !== undefined ? name : null,
        content: content !== undefined ? content : null,
        date: date !== undefined ? date : null,
      });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    startOp();
    setError(null);
    try {
      await invoke('delete_item', { id });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const moveItem = useCallback(async (id: string, newParentId: string | null): Promise<void> => {
    startOp();
    setError(null);
    try {
      await invoke('move_item', { id, newParentId });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const reorderItems = useCallback(async (items: [string, number][]): Promise<void> => {
    startOp();
    setError(null);
    try {
      await invoke('reorder_items', { items });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const listItems = useCallback(async (
    parentId?: string | null,
    itemType?: 'folder' | 'note' | null,
    date?: string | null
  ): Promise<NoteItem[]> => {
    setError(null);
    try {
      return await invoke<NoteItem[]>('list_items', {
        parentId: parentId ?? null,
        itemType: itemType ?? null,
        date: date ?? null,
      });
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const listAllItems = useCallback(async (): Promise<NoteItem[]> => {
    setError(null);
    try {
      return await invoke<NoteItem[]>('list_all_items');
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const searchItems = useCallback(async (query: string): Promise<SearchResult[]> => {
    setError(null);
    try {
      return await invoke<SearchResult[]>('search_items', { query });
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const saveImage = useCallback(async (
    noteId: string,
    filename: string,
    dataBase64: string
  ): Promise<string> => {
    startOp();
    setError(null);
    try {
      return await invoke<string>('save_image', { noteId, filename, dataBase64 });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      endOp();
    }
  }, [startOp, endOp]);

  const getImage = useCallback(async (id: string) => {
    setError(null);
    try {
      return await invoke<{ id: string; note_id: string; filename: string; path: string; created_at: string } | null>(
        'get_image', { id }
      );
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  return {
    loading,
    error,
    createItem,
    getItem,
    updateItem,
    deleteItem,
    moveItem,
    reorderItems,
    listItems,
    listAllItems,
    searchItems,
    saveImage,
    getImage,
  };
}
