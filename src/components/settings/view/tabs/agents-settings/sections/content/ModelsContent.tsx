import { useState } from 'react';
import { Check, Edit3, ExternalLink, Plus, Trash2, X } from 'lucide-react';

import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  CURSOR_MODELS,
  GEMINI_MODELS,
  OPENCODE_MODELS,
} from '../../../../../../../shared/modelConstants';
import { Button, Input } from '../../../../../../../shared/view/ui';
import SessionProviderLogo from '../../../../../../llm-logo-provider/SessionProviderLogo';
import type { AgentProvider } from '../../../../../types/types';
import {
  getCustomModels,
  addCustomModel,
  removeCustomModel,
  updateCustomModel,
} from '../../../../../../utils/customModels';

type ModelsContentProps = {
  agent: AgentProvider;
};

function getBuiltinModels(agent: AgentProvider) {
  if (agent === 'claude') return CLAUDE_MODELS;
  if (agent === 'codex') return CODEX_MODELS;
  if (agent === 'gemini') return GEMINI_MODELS;
  if (agent === 'cursor') return CURSOR_MODELS;
  if (agent === 'opencode') return OPENCODE_MODELS;
  return CLAUDE_MODELS;
}

export default function ModelsContent({ agent }: ModelsContentProps) {
  const builtin = getBuiltinModels(agent);
  const [customModels, setCustomModels] = useState(() => getCustomModels(agent));
  const [showAdd, setShowAdd] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [error, setError] = useState('');

  const allBuiltinValues = new Set(builtin.OPTIONS.map((m) => m.value));

  const resetAddForm = () => {
    setShowAdd(false);
    setAddValue('');
    setAddLabel('');
    setError('');
  };

  const handleAdd = () => {
    const v = addValue.trim();
    const l = addLabel.trim();
    if (!v || !l) {
      setError('Both value and label are required.');
      return;
    }
    if (allBuiltinValues.has(v) || customModels.some((m) => m.value === v)) {
      setError(`Model value "${v}" already exists.`);
      return;
    }
    addCustomModel(agent, v, l);
    setCustomModels(getCustomModels(agent));
    resetAddForm();
  };

  const handleDelete = (value: string) => {
    removeCustomModel(agent, value);
    setCustomModels(getCustomModels(agent));
    if (editKey === value) setEditKey(null);
  };

  const startEdit = (model: { value: string; label: string }) => {
    setEditKey(model.value);
    setEditValue(model.value);
    setEditLabel(model.label);
    setError('');
  };

  const cancelEdit = () => {
    setEditKey(null);
    setEditValue('');
    setEditLabel('');
    setError('');
  };

  const handleSaveEdit = () => {
    const v = editValue.trim();
    const l = editLabel.trim();
    if (!v || !l) {
      setError('Both value and label are required.');
      return;
    }
    if (
      editKey !== v &&
      (allBuiltinValues.has(v) || customModels.some((m) => m.value === v))
    ) {
      setError(`Model value "${v}" already exists.`);
      return;
    }
    updateCustomModel(agent, editKey!, v, l);
    setCustomModels(getCustomModels(agent));
    cancelEdit();
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div>
          <h3 className="text-lg font-medium text-foreground">Models</h3>
          <p className="text-sm text-muted-foreground">
            Manage models for {agent.charAt(0).toUpperCase() + agent.slice(1)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/60">
        <div className="border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Built-in Models</span>
            <span className="ml-auto text-xs text-muted-foreground">{builtin.OPTIONS.length}</span>
          </div>
        </div>
        <div className="divide-y divide-border/30 px-4">
          {builtin.OPTIONS.map((model) => (
            <div key={model.value} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">{model.label}</span>
                <span className="text-xs text-muted-foreground/60 truncate font-mono">{model.value}</span>
              </div>
              {model.value === builtin.DEFAULT && (
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                  Default
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border/60">
        <div className="border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Custom Models</span>
            <span className="ml-auto text-xs text-muted-foreground">{customModels.length}</span>
          </div>
        </div>

        <div className="divide-y divide-border/30 px-4">
          {customModels.map((model) => (
            <div key={model.value} className="py-2.5">
              {editKey === model.value ? (
                <div className="space-y-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Model value (e.g. claude-sonnet-5)"
                    className="h-9 text-sm font-mono"
                  />
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Display label (e.g. Sonnet 5)"
                    className="h-9 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} className="h-8">
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8">
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">{model.label}</span>
                    <span className="text-xs text-muted-foreground/60 truncate font-mono">{model.value}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(model)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(model.value)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border/40 px-4 py-3">
          {showAdd ? (
            <div className="space-y-2">
              <Input
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                placeholder="Model value (e.g. claude-sonnet-5)"
                className="h-9 text-sm font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <Input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Display label (e.g. Sonnet 5)"
                className="h-9 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} className="h-8">
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={resetAddForm} className="h-8">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd(true)}
              className="w-full"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Custom Model
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
