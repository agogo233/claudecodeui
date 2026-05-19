import type { ReactNode, RefObject } from 'react';
import type { FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '../types/types';
import FileTreeNode from './FileTreeNode';

type FileTreeListProps = {
  items: FileTreeNodeType[];
  viewMode: FileTreeViewMode;
  expandedDirs: Set<string>;
  onItemClick: (item: FileTreeNodeType) => void;
  renderFileIcon: (filename: string) => ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (date?: string) => string;
  onRename?: (item: FileTreeNodeType) => void;
  onDelete?: (item: FileTreeNodeType) => void;
  onNewFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onCopyPath?: (item: FileTreeNodeType) => void;
  onDownload?: (item: FileTreeNodeType) => void;
  onRefresh?: () => void;
  onCut?: (item: FileTreeNodeType) => void;
  onPaste?: (dirPath: string) => void;
  renamingItem?: FileTreeNodeType | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
  cutItem?: FileTreeNodeType | null;
  dragItem?: { path: string; type: 'file' | 'directory' } | null;
  hoveredDir?: string | null;
  onDragStart?: (e: React.DragEvent, item: FileTreeNodeType) => void;
  onDragOver?: (e: React.DragEvent, dirPath: string) => void;
  onDragLeave?: (dirPath: string) => void;
  onDrop?: (e: React.DragEvent, targetDir: string) => void;
  onDragEnd?: () => void;
};

export default function FileTreeList({
  items,
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
}: FileTreeListProps) {
  return (
    <div>
      {items.map((item) => (
        <FileTreeNode
          key={item.path}
          item={item}
          level={0}
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
          isCutItem={cutItem?.path === item.path}
          isDragItem={dragItem?.path === item.path}
          isHoveredDir={hoveredDir === item.path}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}