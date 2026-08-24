import type { DragEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Folder, FolderOpen, Scissors, Upload } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '../types/types';
import { Input } from '../../../shared/view/ui';
import FileContextMenu from './FileContextMenu';

type FileTreeNodeProps = {
  item: FileTreeNodeType;
  level: number;
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
  onUpload?: (path: string) => void;
  onRefresh?: () => void;
onCut?: (item: FileTreeNodeType) => void;
  onPaste?: (dirPath: string) => void;
  // Drag-and-drop upload targeting
  dropTarget?: string | null;
  onItemDragOver?: (event: DragEvent<HTMLDivElement>, targetPath: string) => void;
  // Rename state for inline editing
  renamingItem?: FileTreeNodeType | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
  isCutItem?: boolean;
  isDragItem?: boolean;
  isHoveredDir?: boolean;
  onDragStart?: (e: React.DragEvent, item: FileTreeNodeType) => void;
  onDragOver?: (e: React.DragEvent, dirPath: string) => void;
  onDragLeave?: (dirPath: string) => void;
  onDrop?: (e: React.DragEvent, targetDir: string) => void;
  onDragEnd?: () => void;
};

type TreeItemIconProps = {
  item: FileTreeNodeType;
  isOpen: boolean;
  renderFileIcon: (filename: string) => ReactNode;
};

// A file dropped onto a file row should land next to it, in its parent folder.
function getParentDirectoryPath(itemPath: string) {
  const segments = itemPath.split(/[\\/]/);
  segments.pop();
  return segments.join('/');
}

function TreeItemIcon({ item, isOpen, renderFileIcon }: TreeItemIconProps) {
  if (item.type === 'directory') {
    return (
      <span className="flex flex-shrink-0 items-center gap-0.5">
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-150',
            isOpen && 'rotate-90',
          )}
        />
        {isOpen ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </span>
    );
  }

  return <span className="ml-[18px] flex flex-shrink-0 items-center">{renderFileIcon(item.name)}</span>;
}

export default function FileTreeNode({
  item,
  level,
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
  onUpload,
  onRefresh,
onCut,
  onPaste,
  dropTarget,
  onItemDragOver,
  renamingItem,
  renameValue,
  setRenameValue,
  handleConfirmRename,
  handleCancelRename,
  renameInputRef,
  operationLoading,
  isCutItem,
  isDragItem,
  isHoveredDir,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FileTreeNodeProps) {
  const { t } = useTranslation();
  const isDirectory = item.type === 'directory';
  const isOpen = isDirectory && expandedDirs.has(item.path);
  const hasChildren = Boolean(isDirectory && item.children && item.children.length > 0);
  const isRenaming = renamingItem?.path === item.path;
  const dragTargetPath = isDirectory ? item.path : getParentDirectoryPath(item.path);
  const isDropTarget = isDirectory && dropTarget === item.path;

  const nameClassName = cn(
    'text-[13px] leading-tight truncate',
    isDirectory ? 'font-medium text-foreground' : 'text-foreground/90',
  );

  const rowClassName = cn(
    viewMode === 'detailed'
      ? 'group grid grid-cols-12 gap-2 py-[3px] pr-2 hover:bg-accent/60 cursor-pointer items-center rounded-sm transition-colors duration-100'
      : viewMode === 'compact'
      ? 'group flex items-center justify-between py-[3px] pr-2 hover:bg-accent/60 cursor-pointer rounded-sm transition-colors duration-100'
      : 'group flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer rounded-sm hover:bg-accent/60 transition-colors duration-100',
    isDirectory && isOpen && 'border-l-2 border-primary/30',
    (isDirectory && !isOpen) || !isDirectory ? 'border-l-2 border-transparent' : '',
isCutItem && 'opacity-50 border-dashed border-muted-foreground',
    isDragItem && 'opacity-40',
    isHoveredDir && isDirectory && 'bg-accent/50 border-l-2 border-primary',
    'relative',
    isDropTarget && 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/40',
  );

  const handleRowDragStart = (e: React.DragEvent) => {
    if (isRenaming) return;
    onDragStart?.(e, item);
  };

  const handleRowDragOver = (e: React.DragEvent) => {
    if (!isDirectory) return;
    onDragOver?.(e, item.path);
  };

  const handleRowDragLeave = () => {
    if (!isDirectory) return;
    onDragLeave?.(item.path);
  };

  const handleRowDrop = (e: React.DragEvent) => {
    if (!isDirectory) return;
    onDrop?.(e, item.path);
  };

  const handleContextPaste = () => {
    if (!isDirectory) return;
    onPaste?.(item.path);
  };

  if (isRenaming && setRenameValue && handleConfirmRename && handleCancelRename) {
    return (
      <div
        className={cn(rowClassName, 'bg-accent/30')}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
        <Input
          ref={renameInputRef}
          type="text"
          value={renameValue || ''}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') handleConfirmRename();
            if (e.key === 'Escape') handleCancelRename();
          }}
          onBlur={() => {
            setTimeout(() => {
              handleConfirmRename();
            }, 100);
          }}
          className="h-6 flex-1 text-sm"
          disabled={operationLoading}
        />
      </div>
    );
  }

  const uploadHoverButton = isDirectory && onUpload && (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onUpload(item.path);
      }}
      title={t('fileTree.uploadToFolder', 'Upload files to "{{folder}}"', { folder: item.name })}
      aria-label={t('fileTree.uploadToFolder', 'Upload files to "{{folder}}"', { folder: item.name })}
      className={cn(
        'absolute right-1 top-1/2 -translate-y-1/2 rounded p-1',
        'bg-background/80 text-muted-foreground opacity-0 transition-opacity',
        'group-hover:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground',
      )}
    >
      <Upload className="h-3.5 w-3.5" />
    </button>
  );

  const rowContent = (
    <div
      className={rowClassName}
      style={{ paddingLeft: `${level * 16 + 4}px` }}
      onClick={() => onItemClick(item)}
      draggable={!isRenaming}
      onDragStart={handleRowDragStart}
      onDragOver={(event) => {
        handleRowDragOver(event);
        onItemDragOver?.(event, dragTargetPath);
      }}
      onDragLeave={handleRowDragLeave}
      onDrop={handleRowDrop}
      onDragEnd={onDragEnd}
    >
      {isCutItem && (
        <span className="absolute left-0 top-0 bottom-0 flex items-center pl-1">
          <Scissors className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
      {viewMode === 'detailed' ? (
        <>
          <div className="col-span-5 flex min-w-0 items-center gap-1.5">
            <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
            <span className={nameClassName}>{item.name}</span>
          </div>
          <div className="col-span-2 text-sm tabular-nums text-muted-foreground">
            {item.type === 'file' ? formatFileSize(item.size) : ''}
          </div>
          <div className="col-span-3 text-sm text-muted-foreground">{formatRelativeTime(item.modified)}</div>
          <div className="col-span-2 font-mono text-sm text-muted-foreground">{item.permissionsRwx || ''}</div>
        </>
      ) : viewMode === 'compact' ? (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
            <span className={nameClassName}>{item.name}</span>
          </div>
          <div className="ml-2 flex flex-shrink-0 items-center gap-3 text-sm text-muted-foreground">
            {item.type === 'file' && (
              <>
                <span className="tabular-nums">{formatFileSize(item.size)}</span>
                <span className="font-mono">{item.permissionsRwx}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
          <span className={nameClassName}>{item.name}</span>
        </>
      )}
      {uploadHoverButton}
    </div>
  );

  const hasContextMenu = onRename || onDelete || onNewFile || onNewFolder || onCopyPath || onDownload || onRefresh || onCut || onPaste;

  return (
    <div className="select-none">
      {hasContextMenu ? (
        <FileContextMenu
          item={item}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onUpload={onUpload}
          onCopyPath={onCopyPath}
          onDownload={onDownload}
          onRefresh={onRefresh}
          onCut={onCut}
          onPaste={isDirectory ? handleContextPaste : undefined}
        >
          {rowContent}
        </FileContextMenu>
      ) : (
        rowContent
      )}

      {isDirectory && isOpen && hasChildren && (
        <div className="relative">
          <span
            className="absolute bottom-0 top-0 border-l border-border/40"
            style={{ left: `${level * 16 + 14}px` }}
            aria-hidden="true"
          />
          {item.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              level={level + 1}
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
              onUpload={onUpload}
              onRefresh={onRefresh}
onCut={onCut}
              onPaste={onPaste}
              dropTarget={dropTarget}
              onItemDragOver={onItemDragOver}
              renamingItem={renamingItem}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              handleConfirmRename={handleConfirmRename}
              handleCancelRename={handleCancelRename}
              renameInputRef={renameInputRef}
              operationLoading={operationLoading}
              isCutItem={isCutItem}
              isDragItem={isDragItem}
              isHoveredDir={isHoveredDir}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}