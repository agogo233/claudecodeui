import type { ReactNode, RefObject } from 'react';
import { AlertTriangle, Folder, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FileTreeNode, FileTreeViewMode } from '../types/types';
import FileTreeEmptyState from './FileTreeEmptyState';
import FileTreeList from './FileTreeList';

type FileTreeBodyProps = {
  files: FileTreeNode[];
  filteredFiles: FileTreeNode[];
  error?: string | null;
  searchQuery: string;
  viewMode: FileTreeViewMode;
  expandedDirs: Set<string>;
  onItemClick: (item: FileTreeNode) => void;
  renderFileIcon: (filename: string) => ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (date?: string) => string;
  onRename?: (item: FileTreeNode) => void;
  onDelete?: (item: FileTreeNode) => void;
  onNewFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onCopyPath?: (item: FileTreeNode) => void;
  onDownload?: (item: FileTreeNode) => void;
  onRefresh?: () => void;
  onCut?: (item: FileTreeNode) => void;
  onPaste?: (dirPath: string) => void;
  renamingItem?: FileTreeNode | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
  cutItem?: FileTreeNode | null;
  dragItem?: { path: string; type: 'file' | 'directory' } | null;
  hoveredDir?: string | null;
  onDragStart?: (e: React.DragEvent, item: FileTreeNode) => void;
  onDragOver?: (e: React.DragEvent, dirPath: string) => void;
  onDragLeave?: (dirPath: string) => void;
  onDrop?: (e: React.DragEvent, targetDir: string) => void;
  onDragEnd?: () => void;
};

export default function FileTreeBody({
  files,
  filteredFiles,
  error,
  searchQuery,
  viewMode,
  expandedDirs,
  onItemClick,
  renderFileIcon,
  formatFileSize,
  formatRelativeTime,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onDownload,
  onRefresh,
  onCut,
  onPaste,
  renamingItem,
  renameValue,
  setRenameValue,
  handleConfirmRename,
  handleCancelRename,
  renameInputRef,
  operationLoading,
  cutItem,
  dragItem,
  hoveredDir,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FileTreeBodyProps) {
  const { t } = useTranslation();

  return (
    <>
      {error ? (
        <FileTreeEmptyState
          icon={AlertTriangle}
          title={t('fileTree.loadFailed')}
          description={error}
        />
      ) : files.length === 0 ? (
        <FileTreeEmptyState
          icon={Folder}
          title={t('fileTree.noFilesFound')}
          description={t('fileTree.checkProjectPath')}
        />
      ) : filteredFiles.length === 0 && searchQuery ? (
        <FileTreeEmptyState
          icon={Search}
          title={t('fileTree.noMatchesFound')}
          description={t('fileTree.tryDifferentSearch')}
        />
      ) : (
        <FileTreeList
          items={filteredFiles}
          viewMode={viewMode}
          expandedDirs={expandedDirs}
          onItemClick={onItemClick}
          renderFileIcon={renderFileIcon}
          formatFileSize={formatFileSize}
          formatRelativeTime={formatRelativeTime}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onCopyPath={onCopyPath}
          onDownload={onDownload}
          onRefresh={onRefresh}
          onCut={onCut}
          onPaste={onPaste}
          renamingItem={renamingItem}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          handleConfirmRename={handleConfirmRename}
          handleCancelRename={handleCancelRename}
          renameInputRef={renameInputRef}
          operationLoading={operationLoading}
          cutItem={cutItem}
          dragItem={dragItem}
          hoveredDir={hoveredDir}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      )}
    </>
  );
}