import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { api } from '../../../utils/api';
import { copyTextToClipboard } from '../../../utils/clipboard';
import type { FileTreeNode, FileMoveConflict } from '../types/types';
import type { Project } from '../../../types/app';

async function getJsonSafe(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  throw new Error(`Unexpected response: ${response.status} ${text.slice(0, 200)}`);
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export type ToastMessage = {
  message: string;
  type: 'success' | 'error';
};

export type DeleteConfirmation = {
  isOpen: boolean;
  item: FileTreeNode | null;
};

export type UseFileTreeOperationsOptions = {
  selectedProject: Project | null;
  onRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
};

export type UseFileTreeOperationsResult = {
  renamingItem: FileTreeNode | null;
  renameValue: string;
  handleStartRename: (item: FileTreeNode) => void;
  handleCancelRename: () => void;
  handleConfirmRename: () => Promise<void>;
  setRenameValue: (value: string) => void;

  deleteConfirmation: DeleteConfirmation;
  handleStartDelete: (item: FileTreeNode) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;

  isCreating: boolean;
  newItemParent: string;
  newItemType: 'file' | 'directory';
  newItemName: string;
  handleStartCreate: (parentPath: string, type: 'file' | 'directory') => void;
  handleCancelCreate: () => void;
  handleConfirmCreate: () => Promise<void>;
  setNewItemName: (name: string) => void;

  handleCopyPath: (item: FileTreeNode) => void;
  handleDownload: (item: FileTreeNode) => Promise<void>;

  operationLoading: boolean;

  validateFilename: (name: string) => string | null;

  dragItem: { path: string; type: 'file' | 'directory' } | null;
  hoveredDir: string | null;
  handleDragStart: (e: React.DragEvent, item: FileTreeNode) => void;
  handleDragOver: (e: React.DragEvent, dirPath: string) => void;
  handleDragLeave: (dirPath: string) => void;
  handleDrop: (e: React.DragEvent, targetDir: string) => void;
  handleDragEnd: () => void;

  cutItem: FileTreeNode | null;
  handleCut: (item: FileTreeNode) => void;
  handlePaste: (targetDir: string) => Promise<void>;
  clearCut: () => void;

  moveConflict: FileMoveConflict;
  handleMoveFile: (sourcePath: string, destDir: string, overwrite?: boolean) => Promise<void>;
  resolveConflict: (action: 'overwrite' | 'autoRename' | 'cancel') => Promise<void>;
};

export function useFileTreeOperations({
  selectedProject,
  onRefresh,
  showToast,
}: UseFileTreeOperationsOptions): UseFileTreeOperationsResult {
  const { t } = useTranslation();

  const [renamingItem, setRenamingItem] = useState<FileTreeNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    item: null,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [newItemParent, setNewItemParent] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'directory'>('file');
  const [newItemName, setNewItemName] = useState('');
  const [operationLoading, setOperationLoading] = useState(false);

  const [dragItem, setDragItem] = useState<{ path: string; type: 'file' | 'directory' } | null>(null);
  const [hoveredDir, setHoveredDir] = useState<string | null>(null);

  const [cutItem, setCutItem] = useState<FileTreeNode | null>(null);

  const [moveConflict, setMoveConflict] = useState<FileMoveConflict>({
    isOpen: false,
    sourcePath: '',
    destDir: '',
    name: '',
  });

  const validateFilename = useCallback((name: string): string | null => {
    if (!name || !name.trim()) {
      return t('fileTree.validation.emptyName', 'Filename cannot be empty');
    }
    if (INVALID_FILENAME_CHARS.test(name)) {
      return t('fileTree.validation.invalidChars', 'Filename contains invalid characters');
    }
    if (RESERVED_NAMES.test(name)) {
      return t('fileTree.validation.reserved', 'Filename is a reserved name');
    }
    if (/^\.+$/.test(name)) {
      return t('fileTree.validation.dotsOnly', 'Filename cannot be only dots');
    }
    return null;
  }, [t]);

  const handleStartRename = useCallback((item: FileTreeNode) => {
    setRenamingItem(item);
    setRenameValue(item.name);
    setIsCreating(false);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingItem(null);
    setRenameValue('');
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renamingItem || !selectedProject) return;

    const error = validateFilename(renameValue);
    if (error) {
      showToast(error, 'error');
      return;
    }

    if (renameValue === renamingItem.name) {
      handleCancelRename();
      return;
    }

    setOperationLoading(true);
    try {
      const response = await api.renameFile(selectedProject.projectId, {
        oldPath: renamingItem.path,
        newName: renameValue,
      });

      if (!response.ok) {
        const data = await getJsonSafe(response);
        throw new Error(data.error || 'Failed to rename');
      }

      showToast(t('fileTree.toast.renamed', 'Renamed successfully'), 'success');
      onRefresh();
      handleCancelRename();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [renamingItem, renameValue, selectedProject, validateFilename, showToast, t, onRefresh, handleCancelRename]);

  const handleStartDelete = useCallback((item: FileTreeNode) => {
    setDeleteConfirmation({ isOpen: true, item });
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmation({ isOpen: false, item: null });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const { item } = deleteConfirmation;
    if (!item || !selectedProject) return;

    setOperationLoading(true);
    try {
      const response = await api.deleteFile(selectedProject.projectId, {
        path: item.path,
        type: item.type,
      });

      if (!response.ok) {
        const data = await getJsonSafe(response);
        throw new Error(data.error || 'Failed to delete');
      }

      showToast(
        item.type === 'directory'
          ? t('fileTree.toast.folderDeleted', 'Folder deleted')
          : t('fileTree.toast.fileDeleted', 'File deleted'),
        'success'
      );
      onRefresh();
      handleCancelDelete();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [deleteConfirmation, selectedProject, showToast, t, onRefresh, handleCancelDelete]);

  const handleStartCreate = useCallback((parentPath: string, type: 'file' | 'directory') => {
    setNewItemParent(parentPath || '');
    setNewItemType(type);
    setNewItemName(type === 'file' ? 'untitled.txt' : 'new-folder');
    setIsCreating(true);
    setRenamingItem(null);
  }, []);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewItemParent('');
    setNewItemName('');
  }, []);

  const handleConfirmCreate = useCallback(async () => {
    if (!selectedProject) return;

    const error = validateFilename(newItemName);
    if (error) {
      showToast(error, 'error');
      return;
    }

    setOperationLoading(true);
    try {
      const response = await api.createFile(selectedProject.projectId, {
        path: newItemParent,
        type: newItemType,
        name: newItemName,
      });

      if (!response.ok) {
        const data = await getJsonSafe(response);
        throw new Error(data.error || 'Failed to create');
      }

      showToast(
        newItemType === 'file'
          ? t('fileTree.toast.fileCreated', 'File created successfully')
          : t('fileTree.toast.folderCreated', 'Folder created successfully'),
        'success'
      );
      onRefresh();
      handleCancelCreate();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [selectedProject, newItemParent, newItemType, newItemName, validateFilename, showToast, t, onRefresh, handleCancelCreate]);

  const handleCopyPath = useCallback(async (item: FileTreeNode) => {
    const copied = await copyTextToClipboard(item.path);
    if (copied) {
      showToast(t('fileTree.toast.pathCopied', 'Path copied to clipboard'), 'success');
    } else {
      showToast(t('fileTree.toast.copyFailed', 'Failed to copy path'), 'error');
    }
  }, [showToast, t]);

  const triggerBrowserDownload = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
  }, []);

  const handleDownload = useCallback(async (item: FileTreeNode) => {
    if (!selectedProject) return;

    setOperationLoading(true);
    try {
      if (item.type === 'directory') {
        await downloadFolderAsZip(item);
      } else {
        await downloadSingleFile(item);
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [selectedProject, showToast]);

  const downloadSingleFile = useCallback(async (item: FileTreeNode) => {
    if (!selectedProject) return;

    const response = await api.readFileBlob(selectedProject.projectId, item.path);

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    triggerBrowserDownload(blob, item.name);
  }, [selectedProject, triggerBrowserDownload]);

  const downloadFolderAsZip = useCallback(async (folder: FileTreeNode) => {
    if (!selectedProject) return;

    const zip = new JSZip();

    const collectFiles = async (node: FileTreeNode, currentPath: string) => {
      const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;

      if (node.type === 'file') {
        const response = await api.readFileBlob(selectedProject.projectId, node.path);
        if (!response.ok) {
          throw new Error(`Failed to download "${node.name}" for ZIP export`);
        }

        const fileBytes = await response.arrayBuffer();
        zip.file(fullPath, fileBytes);
      } else if (node.type === 'directory' && node.children) {
        for (const child of node.children) {
          await collectFiles(child, fullPath);
        }
      }
    };

    if (folder.children && folder.children.length > 0) {
      for (const child of folder.children) {
        await collectFiles(child, '');
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(zipBlob, `${folder.name}.zip`);

    showToast(t('fileTree.toast.folderDownloaded', 'Folder downloaded as ZIP'), 'success');
  }, [selectedProject, showToast, t, triggerBrowserDownload]);

  const isSubPath = (parent: string, child: string): boolean => {
    return child === parent || child.startsWith(parent + '/');
  };

  const handleMoveFile = useCallback(async (sourcePath: string, destDir: string, overwrite = false) => {
    if (!selectedProject) return;

    if (isSubPath(sourcePath, destDir)) {
      showToast(t('fileTree.toast.circularMove', 'Cannot move into itself'), 'error');
      return;
    }

    setOperationLoading(true);
    try {
      const response = await api.moveFile(selectedProject.projectId, {
        sourcePath,
        destDir,
        overwrite,
        newName: undefined,
      });

      if (response.status === 409) {
        const data = await getJsonSafe(response);
        if (data.conflict) {
          setMoveConflict({
            isOpen: true,
            sourcePath,
            destDir,
            name: data.name,
          });
          return;
        }
        throw new Error(data.error || 'Move failed');
      }

      if (!response.ok) {
        const data = await getJsonSafe(response);
        throw new Error(data.error || 'Failed to move');
      }

      showToast(t('fileTree.toast.moved', 'Moved successfully'), 'success');
      setCutItem(null);
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [selectedProject, showToast, t, onRefresh]);

  const resolveConflict = useCallback(async (action: 'overwrite' | 'autoRename' | 'cancel') => {
    const { sourcePath, destDir, name } = moveConflict;
    setMoveConflict({ isOpen: false, sourcePath: '', destDir: '', name: '' });

    if (action === 'cancel') return;

    if (action === 'overwrite') {
      return handleMoveFile(sourcePath, destDir, true);
    }

    if (action === 'autoRename') {
      const dotIndex = name.lastIndexOf('.');
      const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
      const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;

      for (let i = 1; i <= 100; i++) {
        const newName = `${base}_${i}${ext}`;
        try {
          if (!selectedProject) return;
          const response = await api.moveFile(selectedProject.projectId, {
            sourcePath,
            destDir,
            overwrite: false,
            newName,
          });
          if (response.ok) {
            showToast(t('fileTree.toast.moved', 'Moved successfully'), 'success');
            setCutItem(null);
            onRefresh();
            return;
          }
          const data = await getJsonSafe(response);
          if (!data.conflict) {
            throw new Error(data.error || 'Move failed');
          }
        } catch (err) {
          showToast((err as Error).message, 'error');
          return;
        }
      }
      showToast(t('fileTree.toast.renameFailed', 'Could not find available name'), 'error');
    }
  }, [moveConflict, selectedProject, showToast, t, onRefresh]);

  const handleDragStart = useCallback((e: React.DragEvent, item: FileTreeNode) => {
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.setData('application/x-item-type', item.type);
    e.dataTransfer.effectAllowed = 'move';
    setDragItem({ path: item.path, type: item.type });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dirPath: string) => {
    if (!dragItem) return;
    if (dragItem.path === dirPath) return;
    if (dirPath.startsWith(dragItem.path + '/')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredDir(dirPath);
  }, [dragItem]);

  const handleDragLeave = useCallback((dirPath: string) => {
    if (hoveredDir === dirPath) {
      setHoveredDir(null);
    }
  }, [hoveredDir]);

  const handleDrop = useCallback((e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredDir(null);

    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;

    if (sourcePath === targetDir) return;

    const uploadData = e.dataTransfer.types;
    const isExternalUpload = Array.from(uploadData).includes('Files');
    if (isExternalUpload) return;

    handleMoveFile(sourcePath, targetDir, false);
    setDragItem(null);
  }, [handleMoveFile]);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setHoveredDir(null);
  }, []);

  const handleCut = useCallback((item: FileTreeNode) => {
    setCutItem(item);
  }, []);

  const handlePaste = useCallback(async (targetDir: string) => {
    if (!cutItem || !selectedProject) return;

    await handleMoveFile(cutItem.path, targetDir, false);
  }, [cutItem, selectedProject, handleMoveFile]);

  const clearCut = useCallback(() => {
    setCutItem(null);
  }, []);

  return {
    renamingItem,
    renameValue,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    setRenameValue,

    deleteConfirmation,
    handleStartDelete,
    handleCancelDelete,
    handleConfirmDelete,

    isCreating,
    newItemParent,
    newItemType,
    newItemName,
    handleStartCreate,
    handleCancelCreate,
    handleConfirmCreate,
    setNewItemName,

    handleCopyPath,
    handleDownload,

    operationLoading,

    validateFilename,

    dragItem,
    hoveredDir,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,

    cutItem,
    handleCut,
    handlePaste,
    clearCut,

    moveConflict,
    handleMoveFile,
    resolveConflict,
  };
}