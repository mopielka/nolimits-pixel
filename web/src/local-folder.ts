import type { LocalFile } from './sources.ts';

/** File System Access API bits TypeScript's DOM types don't cover yet (Chrome/Edge only). */
declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface DataTransferItem {
    getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
  }
  interface FileSystemHandle {
    queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
    requestPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  }
}

/** Folders that never hold animation files but can be huge (a checkout with the tools as a submodule). */
const SKIP = new Set(['node_modules', '.git', 'out', 'pixel', 'dist-web']);

/** An animation folder; `signature` exists when the folder can be re-read to follow edits live. */
export interface FolderPackage {
  name: string;
  read(): Promise<LocalFile[]>;
  signature?(): Promise<string>;
}

export const canWatchFolders = typeof window.showDirectoryPicker === 'function';

async function listHandle(dir: FileSystemDirectoryHandle, prefix = ''): Promise<LocalFile[]> {
  const files: LocalFile[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      if (!SKIP.has(entry.name)) files.push(...(await listHandle(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`)));
    } else {
      files.push({ path: prefix + entry.name, file: await (entry as FileSystemFileHandle).getFile() });
    }
  }
  return files;
}

function handlePackage(name: string, dir: FileSystemDirectoryHandle): FolderPackage {
  return {
    name,
    read: () => listHandle(dir),
    signature: async () =>
      (await listHandle(dir))
        .map(({ path, file }) => `${path}:${file.size}:${file.lastModified}`)
        .sort()
        .join('|'),
  };
}

/** The picked folder itself if it's an animation, otherwise the animations one level down. */
export async function packagesInHandle(root: FileSystemDirectoryHandle): Promise<FolderPackage[]> {
  const has = async (dir: FileSystemDirectoryHandle) => {
    try {
      await dir.getFileHandle('index.json');
      return true;
    } catch {
      return false;
    }
  };
  if (await has(root)) return [handlePackage(root.name, root)];
  const found: FolderPackage[] = [];
  for await (const entry of root.values()) {
    if (entry.kind === 'directory' && !SKIP.has(entry.name) && (await has(entry as FileSystemDirectoryHandle))) {
      found.push(handlePackage(entry.name, entry as FileSystemDirectoryHandle));
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Same as packagesInHandle, for browsers that only hand over a one-off list of files. */
export function packagesInFiles(rootName: string, files: LocalFile[]): FolderPackage[] {
  const visible = files.filter(({ path }) => !path.split('/').some((part) => SKIP.has(part)));
  const snapshot = (name: string, prefix: string): FolderPackage => ({
    name,
    read: async () =>
      visible.filter(({ path }) => path.startsWith(prefix)).map(({ path, file }) => ({ path: path.slice(prefix.length), file })),
  });
  if (visible.some(({ path }) => path === 'index.json')) return [snapshot(rootName, '')];
  return visible
    .filter(({ path }) => /^[^/]+\/index\.json$/.test(path))
    .map(({ path }) => path.split('/')[0])
    .sort()
    .map((dir) => snapshot(dir, `${dir}/`));
}

/** Files from `<input webkitdirectory>`, re-rooted at the chosen folder. */
export function filesFromDirectoryInput(list: FileList): { rootName: string; files: LocalFile[] } {
  const all = [...list];
  const rootName = all[0]?.webkitRelativePath.split('/')[0] ?? 'folder';
  return { rootName, files: all.map((file) => ({ path: file.webkitRelativePath.split('/').slice(1).join('/'), file })) };
}

/** Reads a dropped folder through the older entries API (Safari, Firefox), with paths relative to it. */
export async function filesFromEntry(dir: FileSystemDirectoryEntry, prefix = ''): Promise<LocalFile[]> {
  const reader = dir.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const files: LocalFile[] = [];
  for (const child of children) {
    if (child.isFile) {
      const file = await new Promise<File>((resolve, reject) => (child as FileSystemFileEntry).file(resolve, reject));
      files.push({ path: prefix + child.name, file });
    } else if (!SKIP.has(child.name)) {
      files.push(...(await filesFromEntry(child as FileSystemDirectoryEntry, `${prefix}${child.name}/`)));
    }
  }
  return files;
}

// --- remembering the last folder (handles survive reloads in IndexedDB) ------

const DB = 'pixel-player';
const STORE = 'handles';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const tx = (await db()).transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, 'folder');
  } catch {
    // Private mode or storage blocked – the folder just won't be offered after a reload.
  }
}

export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const req = (await db()).transaction(STORE).objectStore(STORE).get('folder');
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

/** True once the browser lets us read the folder; asking needs a click. */
export async function canRead(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  if ((await handle.queryPermission?.({ mode: 'read' })) === 'granted') return true;
  return ask && (await handle.requestPermission?.({ mode: 'read' })) === 'granted';
}
