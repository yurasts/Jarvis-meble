import { useCallback, useState } from 'react';

// Какие секции рабочей области проекта (desktop) развёрнуты. Состояние общее для всех проектов и
// переживает переключение проектов и перезагрузку страницы: хранится в localStorage этого
// браузера (удобство одного пользователя, не данные проекта). Без доступа к localStorage
// (приватный режим, запрет cookies) всё работает, просто без запоминания.
export const WORKSPACE_SECTIONS_STORAGE_KEY = 'jarvis.workspaceSections.v1';
export const WORKSPACE_SECTION_IDS = Object.freeze(['materials', 'services', 'cash', 'tasks', 'info']);

const readStored = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_SECTIONS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeStored = (value) => {
  try {
    window.localStorage.setItem(WORKSPACE_SECTIONS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Запоминание — только удобство; без хранилища секции просто откроются заново.
  }
};

export default function useWorkspaceSections() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = readStored();
    return Object.fromEntries(WORKSPACE_SECTION_IDS.map(id => [id, stored[id] === false]));
  });

  const isOpen = useCallback((id) => !collapsed[id], [collapsed]);

  const setOpen = useCallback((id, open) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !open };
      writeStored(Object.fromEntries(WORKSPACE_SECTION_IDS.map(key => [key, !next[key]])));
      return next;
    });
  }, []);

  const toggle = useCallback((id) => setOpen(id, collapsed[id]), [collapsed, setOpen]);

  return { isOpen, setOpen, toggle };
}
