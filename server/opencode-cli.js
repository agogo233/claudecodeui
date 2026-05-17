import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import crossSpawn from 'cross-spawn';

import sessionManager from './sessionManager.js';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { createNormalizedMessage } from './shared/utils.js';

const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

let activeProcesses = new Map();

class ACPClient {
  constructor(process) {
    this.process = process;
    this.requestId = 1;
    this.pending = new Map();
    this.notificationCB = null;
    this.requestCB = null;
    this.buffer = '';
    this._setupStdio();
  }

  _setupStdio() {
    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          this._processMessage(JSON.parse(t));
        } catch (e) {
          console.error('[opencode ACP] Failed to parse line:', e.message);
        }
      }
    });
  }

  _processMessage(msg) {
    if (msg.id != null && this.pending.has(msg.id)) {
      const cb = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) cb.reject(new Error(msg.error.message || msg.error.code));
      else cb.resolve(msg.result);
      return;
    }

    if (msg.method) {
      if (msg.id == null) {
        if (this.notificationCB) this.notificationCB(msg);
      } else {
        if (this.requestCB) this.requestCB(msg);
      }
      return;
    }
  }

  async request(method, params) {
    const id = this.requestId++;
    const line = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(line);
    });
  }

  sendNotification(method, params) {
    const line = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(line);
  }

  sendResponse(id, result) {
    const line = JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
    this.process.stdin.write(line);
  }

  close() {
    this.process.stdin.end();
  }

  kill() {
    try { this.process.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => {
      try { this.process.kill('SIGKILL'); } catch (e) {}
    }, 2000);
  }
}

async function spawnOpencode(command, options = {}, ws) {
  const { sessionId, projectPath, cwd, model, permissionMode, sessionSummary } = options;
  let capturedSessionId = sessionId;
  let sessionCreatedSent = false;
  let promptCompleted = false;

  const settings = options.toolsSettings || {
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: false
  };

  const skipPermissions = settings.skipPermissions || options.skipPermissions || permissionMode === 'yolo' || permissionMode === 'bypassPermissions';

  const opencodeBin = process.env.OPENCODE_BIN_PATH || 'opencode';
  const workingDir = (cwd || projectPath || process.cwd()).replace(/[^\x20-\x7E]/g, '').trim();

  const args = ['acp', '--cwd', workingDir];

  let spawnCmd = opencodeBin;
  let spawnArgs = args;

  if (os.platform() !== 'win32') {
    spawnCmd = 'sh';
    spawnArgs = ['-c', 'exec "$0" "$@"', opencodeBin, ...args];
  }

  const childProcess = spawnFunction(spawnCmd, spawnArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let terminalNotificationSent = false;
  let terminalFailureReason = null;

  const notifyTerminalState = ({ code = null, error = null } = {}) => {
    if (terminalNotificationSent) return;
    terminalNotificationSent = true;
    const sid = capturedSessionId || sessionId || processKey;
    if (code === 0 && !error) {
      notifyRunStopped({ userId: ws?.userId || null, provider: 'opencode', sessionId: sid, sessionName: sessionSummary, stopReason: 'completed' });
      return;
    }
    notifyRunFailed({ userId: ws?.userId || null, provider: 'opencode', sessionId: sid, sessionName: sessionSummary, error: error || terminalFailureReason || `Opencode CLI exited with code ${code}` });
  };

  const processKey = capturedSessionId || sessionId || Date.now().toString();
  activeProcesses.set(processKey, childProcess);
  childProcess.sessionId = processKey;

  const timeoutMs = 180000;
  let timeout;

  const startTimeout = () => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      terminalFailureReason = `Opencode ACP timeout - no response for ${timeoutMs / 1000}s`;
      const sid = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);
      ws.send(createNormalizedMessage({ kind: 'error', content: terminalFailureReason, sessionId: sid, provider: 'opencode' }));
      if (acp) acp.kill();
    }, timeoutMs);
  };

  startTimeout();

  if (command && capturedSessionId) {
    sessionManager.addMessage(capturedSessionId, 'user', command);
  }

  childProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const sid = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);
    ws.send(createNormalizedMessage({ kind: 'error', content: text, sessionId: sid, provider: 'opencode' }));
  });

  let acp;
  let acpSessionId;
  let assistantBlocks = [];

  try {
    acp = new ACPClient(childProcess);

    acp.requestCB = async (msg) => {
      const { id, method, params } = msg;
      try {
        switch (method) {
          case 'session/request_permission':
            acp.sendResponse(id, {
              outcome: skipPermissions
                ? { outcome: 'selected', optionId: params?.options?.[0]?.optionId || 'once' }
                : { outcome: 'cancelled' }
            });
            break;

          case 'fs/read_text_file':
            const content = await fs.readFile(params.path, 'utf8');
            acp.sendResponse(id, { content });
            break;

          case 'fs/write_text_file':
            await fs.writeFile(params.path, params.content, 'utf8');
            acp.sendResponse(id, {});
            break;

          default:
            acp.sendResponse(id, {});
        }
      } catch (err) {
        acp.sendResponse(id, { error: { message: err.message } });
      }
    };

    acp.notificationCB = (msg) => {
      if (msg.method !== 'session/update') return;
      const update = msg.params?.update;
      if (!update) return;
      const sid = msg.params.sessionId || capturedSessionId;

      startTimeout();

      const wsSend = (kind, extra = {}) => {
        ws.send(createNormalizedMessage({
          id: `oc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          sessionId: sid,
          timestamp: new Date().toISOString(),
          provider: 'opencode',
          kind,
          ...extra,
        }));
      };

      switch (update.sessionUpdate) {
        case 'agent_thought_chunk': {
          const text = update.content?.text || '';
          if (text) {
            wsSend('thinking', { content: text });
            if (assistantBlocks.length > 0 && assistantBlocks[assistantBlocks.length - 1].type === 'thinking') {
              assistantBlocks[assistantBlocks.length - 1].text += text;
            } else {
              assistantBlocks.push({ type: 'thinking', text });
            }
          }
          break;
        }

        case 'agent_message_chunk': {
          const text = update.content?.text || '';
          if (text) {
            wsSend('stream_delta', { content: text });
            if (assistantBlocks.length > 0 && assistantBlocks[assistantBlocks.length - 1].type === 'text') {
              assistantBlocks[assistantBlocks.length - 1].text += text;
            } else {
              assistantBlocks.push({ type: 'text', text });
            }
          }
          break;
        }

        case 'tool_call': {
          wsSend('tool_use', {
            toolName: update.title || update.kind || 'Tool',
            toolInput: update.rawInput || {},
            toolId: update.toolCallId || `tc_${Date.now()}`,
          });
          break;
        }

        case 'tool_call_update': {
          if (update.status === 'completed' || update.status === 'failed') {
            const output = update.rawOutput?.output || update.content?.[0]?.content?.text || '';
            wsSend('tool_result', {
              toolId: update.toolCallId || '',
              content: typeof output === 'string' ? output : JSON.stringify(output),
              isError: update.status === 'failed',
            });
          }
          break;
        }

        case 'usage_update': {
          wsSend('status', {
            text: 'Complete',
            tokens: update.used || 0,
            canInterrupt: false,
          });
          break;
        }

        case 'user_message_chunk':
        case 'config_option_update':
        case 'current_mode_update':
        case 'session_info_update':
        case 'plan':
        case 'available_commands_update':
          break;
      }
    };

    await acp.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        _meta: { 'terminal-auth': true },
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: 'CloudCLI-UI', version: '1.0.0' },
    });

    const modelToUse = model || process.env.OPENCODE_DEFAULT_MODEL || 'anthropic/claude-sonnet-4';
    const newSessionResult = await acp.request('session/new', {
      cwd: workingDir,
      mcpServers: [],
    });

    acpSessionId = newSessionResult.sessionId;
    capturedSessionId = capturedSessionId || acpSessionId;

    if (model && newSessionResult.configOptions) {
      try {
        await acp.request('session/set_config_option', {
          sessionId: acpSessionId,
          configId: 'model',
          value: model,
        });
      } catch (e) {
      }
    }

    if (processKey !== capturedSessionId) {
      activeProcesses.delete(processKey);
      activeProcesses.set(capturedSessionId, childProcess);
    }
    childProcess.sessionId = capturedSessionId;
    if (ws.setSessionId && typeof ws.setSessionId === 'function') {
      ws.setSessionId(capturedSessionId);
    }

    if (!capturedSessionId) {
      capturedSessionId = acpSessionId;
    }
    sessionManager.createSession(capturedSessionId, workingDir);
    if (command) {
      sessionManager.addMessage(capturedSessionId, 'user', command);
    }

    if (!sessionId && !sessionCreatedSent) {
      sessionCreatedSent = true;
      ws.send(createNormalizedMessage({ kind: 'session_created', newSessionId: capturedSessionId, sessionId: capturedSessionId, provider: 'opencode' }));
    }

    const sess = sessionManager.getSession(capturedSessionId);
    if (sess && !sess.cliSessionId) {
      sess.cliSessionId = acpSessionId;
      sessionManager.saveSession(capturedSessionId);
    }

    if (command && command.trim()) {
      const promptResult = await acp.request('session/prompt', {
        sessionId: acpSessionId,
        prompt: [{ type: 'text', text: command }],
      });

      promptCompleted = true;

      if (capturedSessionId && assistantBlocks.length > 0) {
        sessionManager.addMessage(capturedSessionId, 'assistant', [...assistantBlocks]);
        assistantBlocks = [];
      }

      ws.send(createNormalizedMessage({ kind: 'stream_end', sessionId: capturedSessionId, provider: 'opencode' }));
      ws.send(createNormalizedMessage({ kind: 'complete', exitCode: 0, isNewSession: !sessionId && !!command, sessionId: capturedSessionId, provider: 'opencode' }));
    }

    try {
      await acp.request('session/close', { sessionId: acpSessionId });
    } catch (e) {
    }

    acp.close();

  } catch (error) {
    console.error('[opencode ACP] Error:', error.message);
    const sid = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);
    ws.send(createNormalizedMessage({ kind: 'error', content: error.message, sessionId: sid, provider: 'opencode' }));
    ws.send(createNormalizedMessage({ kind: 'complete', exitCode: 1, sessionId: sid, provider: 'opencode' }));
    if (acp) acp.kill();
  }

  return new Promise((resolve, reject) => {
    childProcess.on('close', async (code) => {
      clearTimeout(timeout);
      activeProcesses.delete(capturedSessionId || sessionId || processKey);

      if (code === 0 || code === null) {
        notifyTerminalState({ code: 0 });
        resolve();
      } else {
        const sid = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);

        if (code === 127) {
          const installed = await providerAuthService.isProviderInstalled('opencode');
          if (!installed) {
            terminalFailureReason = 'Opencode CLI is not installed. Please install it first: https://opencode.ai';
            ws.send(createNormalizedMessage({ kind: 'error', content: terminalFailureReason, sessionId: sid, provider: 'opencode' }));
          }
        }

        notifyTerminalState({ code, error: terminalFailureReason });
        reject(new Error(terminalFailureReason || `Opencode CLI exited with code ${code}`));
      }
    });

    childProcess.on('error', async (err) => {
      clearTimeout(timeout);
      const sid = typeof ws.getSessionId === 'function' ? ws.getSessionId() : (capturedSessionId || sessionId || processKey);

      const installed = await providerAuthService.isProviderInstalled('opencode');
      const errorContent = !installed
        ? 'Opencode CLI is not installed. Please install it first: https://opencode.ai'
        : err.message;

      ws.send(createNormalizedMessage({ kind: 'error', content: errorContent, sessionId: sid, provider: 'opencode' }));
      notifyTerminalState({ error: err });
      reject(err);
    });
  });
}

function abortOpencodeSession(sessionId) {
  let proc = activeProcesses.get(sessionId);
  if (!proc) {
    for (const [key, p] of activeProcesses.entries()) {
      if (p.sessionId === sessionId) {
        proc = p;
        break;
      }
    }
  }
  if (proc) {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
      }, 2000);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function isOpencodeSessionActive(sessionId) {
  return activeProcesses.has(sessionId);
}

function getActiveOpencodeSessions() {
  return Array.from(activeProcesses.keys());
}

export {
  spawnOpencode,
  abortOpencodeSession,
  isOpencodeSessionActive,
  getActiveOpencodeSessions,
};
