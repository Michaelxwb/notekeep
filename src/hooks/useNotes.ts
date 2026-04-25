import { invoke } from '@tauri-apps/api/core';
import { useState, useCallback } from 'react';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createItem = useCallback(async (
    parentId: string | null,
    name: string,
    itemType: 'folder' | 'note',
    date?: string
  ): Promise<string> => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  const getItem = useCallback(async (id: string): Promise<NoteItem | null> => {
    setLoading(true);
    setError(null);
    try {
      return await invoke<NoteItem | null>('get_item', { id });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateItem = useCallback(async (
    id: string,
    name?: string,
    content?: string,
    date?: string
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await invoke('update_item', {
        id,
        // undefined = don't update field; empty string is a valid value (clear content)
        name: name !== undefined ? name : null,
        content: content !== undefined ? content : null,
        date: date !== undefined ? date : null,
      });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await invoke('delete_item', { id });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const moveItem = useCallback(async (id: string, newParentId: string | null): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await invoke('move_item', { id, newParentId });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const reorderItems = useCallback(async (items: [string, number][]): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await invoke('reorder_items', { items });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const listItems = useCallback(async (
    parentId?: string | null,
    itemType?: 'folder' | 'note' | null,
    date?: string | null
  ): Promise<NoteItem[]> => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  const listAllItems = useCallback(async (): Promise<NoteItem[]> => {
    setLoading(true);
    setError(null);
    try {
      return await invoke<NoteItem[]>('list_all_items');
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const searchItems = useCallback(async (query: string): Promise<SearchResult[]> => {
    setLoading(true);
    setError(null);
    try {
      return await invoke<SearchResult[]>('search_items', { query });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveImage = useCallback(async (
    noteId: string,
    filename: string,
    dataBase64: string
  ): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      return await invoke<string>('save_image', { noteId, filename, dataBase64 });
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const getImage = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      return await invoke<{ id: string; note_id: string; filename: string; path: string; created_at: string } | null>(
        'get_image', { id }
      );
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setLoading(false);
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
