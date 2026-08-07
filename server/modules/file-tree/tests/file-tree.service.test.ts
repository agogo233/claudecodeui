import assert from 'node:assert/strict';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createFileTreeService } from '@/modules/file-tree/file-tree.service.js';
import type {
  FileTreeDirectoryEntry,
  FileTreeFileSystem,
  FileTreeServiceDependencies,
  FileTreeStats,
} from '@/shared/types.js';
import { AppError } from '@/shared/utils.js';

function createDirectoryEntry(name: string, directory: boolean): FileTreeDirectoryEntry {
  return {
    name,
    isDirectory: () => directory,
  };
}

function createStats(directory: boolean, mode: number): FileTreeStats {
  return {
    size: directory ? 0 : 24,
    mtime: new Date('2026-01-02T03:04:05.000Z'),
    mode,
    isDirectory: () => directory,
    isSymbolicLink: () => false,
  };
}

function createFakeFileSystem(
  overrides: Partial<FileTreeFileSystem> = {},
): FileTreeFileSystem {
  const unexpectedOperation = async (): Promise<never> => {
    throw new Error('Unexpected File Tree filesystem operation');
  };

  return {
    access: unexpectedOperation,
    stat: unexpectedOperation,
    lstat: unexpectedOperation,
    readdir: unexpectedOperation,
    realpath: unexpectedOperation,
    readTextFile: unexpectedOperation,
    writeTextFile: unexpectedOperation,
    makeDirectory: unexpectedOperation,
    rename: unexpectedOperation,
    removeDirectory: unexpectedOperation,
    unlink: unexpectedOperation,
    copyFile: unexpectedOperation,
    createReadStream: () => Readable.from([]),
    ...overrides,
  };
}

function createDependencies(
  fileSystem: FileTreeFileSystem,
  projectRoot: string,
): FileTreeServiceDependencies {
  return {
    fileSystem,
    projects: {
      getProjectPathById: async () => projectRoot,
    },
    workspace: {
      rootPath: projectRoot,
      validatePath: async (candidatePath) => ({ valid: true, resolvedPath: candidatePath }),
    },
    resolveMimeType: () => 'text/plain',
    fileSystemConcurrency: 4,
    logger: { error: () => undefined },
  };
}

test('listProjectFiles builds a sorted tree and skips generated directories', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const sourceDirectory = path.join(projectRoot, 'src');
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
    readdir: async (directoryPath) => {
      if (directoryPath === projectRoot) {
        return [
          createDirectoryEntry('node_modules', true),
          createDirectoryEntry('README.md', false),
          createDirectoryEntry('src', true),
        ];
      }
      if (directoryPath === sourceDirectory) {
        return [createDirectoryEntry('index.ts', false)];
      }
      return [];
    },
    lstat: async (candidatePath) => createStats(candidatePath === sourceDirectory, 0o754),
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const tree = await service.listProjectFiles('project-1');

  assert.deepEqual(tree.map((entry) => entry.name), ['src', 'README.md']);
  const sourceEntry = tree[0];
  assert.ok(sourceEntry);
  assert.equal(sourceEntry.type, 'directory');
  assert.equal(sourceEntry.permissions, '754');
  assert.equal(sourceEntry.permissionsRwx, 'rwxr-xr--');
  assert.deepEqual(sourceEntry.children?.map((entry) => entry.name), ['index.ts']);
});

test('listProjectFiles excludes gitignored entries only when requested', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const cacheDirectory = path.join(projectRoot, 'cache');
  const sourceDirectory = path.join(projectRoot, 'src');
  const readDirectories: string[] = [];
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
    readTextFile: async (filePath) => {
      assert.equal(filePath, path.join(projectRoot, '.gitignore'));
      return ['*.log', '!keep.log', 'cache/', 'src/generated.ts'].join('\n');
    },
    readdir: async (directoryPath) => {
      readDirectories.push(directoryPath);
      if (directoryPath === projectRoot) {
        return [
          createDirectoryEntry('.gitignore', false),
          createDirectoryEntry('cache', true),
          createDirectoryEntry('ignored.log', false),
          createDirectoryEntry('keep.log', false),
          createDirectoryEntry('src', true),
        ];
      }
      if (directoryPath === cacheDirectory) {
        return [createDirectoryEntry('cached.txt', false)];
      }
      if (directoryPath === sourceDirectory) {
        return [
          createDirectoryEntry('generated.ts', false),
          createDirectoryEntry('index.ts', false),
        ];
      }
      return [];
    },
    lstat: async (candidatePath) => createStats(
      candidatePath === cacheDirectory || candidatePath === sourceDirectory,
      0o644,
    ),
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const tree = await service.listProjectFiles('project-1', { respectGitignore: true });

  assert.deepEqual(tree.map((entry) => entry.name), ['src', '.gitignore', 'keep.log']);
  assert.deepEqual(tree[0]?.children?.map((entry) => entry.name), ['index.ts']);
  assert.equal(readDirectories.includes(cacheDirectory), false);
});

test('listProjectFiles returns the normal tree when no gitignore exists', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
    readTextFile: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    readdir: async (directoryPath) => directoryPath === projectRoot
      ? [createDirectoryEntry('debug.log', false)]
      : [],
    lstat: async () => createStats(false, 0o644),
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const tree = await service.listProjectFiles('project-1', { respectGitignore: true });

  assert.deepEqual(tree.map((entry) => entry.name), ['debug.log']);
});

test('readTextFile rejects traversal before invoking the filesystem adapter', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const readPaths: string[] = [];
  const fileSystem = createFakeFileSystem({
    readTextFile: async (filePath) => {
      readPaths.push(filePath);
      return 'should not be read';
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.readTextFile('project-1', '../secret.txt'),
    (error: unknown) => error instanceof AppError
      && error.code === 'PATH_OUTSIDE_PROJECT'
      && error.statusCode === 403,
  );
  assert.deepEqual(readPaths, []);
});

test('createEntry performs filesystem mutation only through the injected adapter', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const targetPath = path.join(projectRoot, 'notes.txt');
  const writtenFiles: Array<{ filePath: string; content: string }> = [];
  const fileSystem = createFakeFileSystem({
    access: async (candidatePath) => {
      if (candidatePath === targetPath) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    },
    writeTextFile: async (filePath, content) => {
      writtenFiles.push({ filePath, content });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const result = await service.createEntry({
    projectId: 'project-1',
    parentPath: projectRoot,
    type: 'file',
    name: 'notes.txt',
  });

  assert.equal(result.path, targetPath);
  assert.deepEqual(writtenFiles, [{ filePath: targetPath, content: '' }]);
});

test('moveEntry renames within the project and records the destination', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const sourcePath = path.join(projectRoot, 'src', 'example.ts');
  const destPath = path.join(projectRoot, 'docs', 'example.ts');
  const movedPaths: Array<{ oldPath: string; newPath: string }> = [];
  const fileSystem = createFakeFileSystem({
    access: async (candidatePath) => {
      if (candidatePath === destPath) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    },
    rename: async (oldPath, newPath) => {
      movedPaths.push({ oldPath, newPath });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const result = await service.moveEntry({
    projectId: 'project-1',
    sourcePath: 'src/example.ts',
    destDir: 'docs',
    overwrite: false,
    newName: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.sourcePath, sourcePath);
  assert.equal(result.destPath, destPath);
  assert.deepEqual(movedPaths, [{ oldPath: sourcePath, newPath: destPath }]);
});

test('moveEntry reports a 409 conflict with the entry name when the destination exists', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'src/example.ts',
      destDir: 'docs',
      overwrite: false,
      newName: null,
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 409
      && error.code === 'FILE_TREE_ENTRY_EXISTS'
      && (error.details as { name: string }).name === 'example.ts',
  );
});

test('moveEntry overwrites an existing destination when requested', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const sourcePath = path.join(projectRoot, 'src', 'example.ts');
  const destPath = path.join(projectRoot, 'docs', 'example.ts');
  const removedPaths: string[] = [];
  const renamedPaths: Array<{ oldPath: string; newPath: string }> = [];
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
    removeDirectory: async (candidatePath) => {
      removedPaths.push(candidatePath);
    },
    rename: async (oldPath, newPath) => {
      renamedPaths.push({ oldPath, newPath });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const result = await service.moveEntry({
    projectId: 'project-1',
    sourcePath: 'src/example.ts',
    destDir: 'docs',
    overwrite: true,
    newName: null,
  });

  assert.equal(result.success, true);
  assert.deepEqual(removedPaths, [destPath]);
  assert.deepEqual(renamedPaths, [{ oldPath: sourcePath, newPath: destPath }]);
});

test('moveEntry applies newName when provided', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const sourcePath = path.join(projectRoot, 'src', 'example.ts');
  const destPath = path.join(projectRoot, 'docs', 'renamed.ts');
  const renamedPaths: Array<{ oldPath: string; newPath: string }> = [];
  const fileSystem = createFakeFileSystem({
    access: async (candidatePath) => {
      if (candidatePath === destPath) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    },
    rename: async (oldPath, newPath) => {
      renamedPaths.push({ oldPath, newPath });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  const result = await service.moveEntry({
    projectId: 'project-1',
    sourcePath: 'src/example.ts',
    destDir: 'docs',
    overwrite: false,
    newName: 'renamed.ts',
  });

  assert.equal(result.destPath, destPath);
  assert.deepEqual(renamedPaths, [{ oldPath: sourcePath, newPath: destPath }]);
});

test('moveEntry rejects circular moves', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'folder',
      destDir: 'folder/sub',
      overwrite: false,
      newName: null,
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 400
      && error.code === 'CIRCULAR_MOVE',
  );
});

test('moveEntry rejects a missing source', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const fileSystem = createFakeFileSystem({
    access: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'missing.ts',
      destDir: 'docs',
      overwrite: false,
      newName: null,
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 404
      && error.code === 'FILE_TREE_ENTRY_NOT_FOUND',
  );
});

test('moveEntry rejects a missing destination directory', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const destDir = path.join(projectRoot, 'docs');
  const fileSystem = createFakeFileSystem({
    access: async (candidatePath) => {
      if (candidatePath === destDir) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'src/example.ts',
      destDir: 'docs',
      overwrite: false,
      newName: null,
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 404
      && error.code === 'FILE_TREE_DEST_NOT_FOUND',
  );
});

test('moveEntry maps cross-filesystem rename errors to a 400', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const destPath = path.join(projectRoot, 'docs', 'example.ts');
  const fileSystem = createFakeFileSystem({
    access: async (candidatePath) => {
      if (candidatePath === destPath) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    },
    rename: async () => {
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'src/example.ts',
      destDir: 'docs',
      overwrite: false,
      newName: null,
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 400
      && error.message === 'Cannot move across different filesystems',
  );
});

test('moveEntry refuses to overwrite a destination that is an ancestor of the source', async () => {
  const projectRoot = path.resolve('file-tree-test-project');
  const fileSystem = createFakeFileSystem({
    access: async () => undefined,
    removeDirectory: async () => {
      throw new Error('removeDirectory must not run for an ancestor destination');
    },
  });
  const service = createFileTreeService(createDependencies(fileSystem, projectRoot));

  await assert.rejects(
    service.moveEntry({
      projectId: 'project-1',
      sourcePath: 'docs/notes.md',
      destDir: '.',
      overwrite: true,
      newName: 'docs',
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 400
      && error.code === 'CIRCULAR_MOVE',
  );
});
