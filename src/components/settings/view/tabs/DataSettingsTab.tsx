import { useState } from 'react';
import { AlertTriangle, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../shared/view/ui';
import { api } from '../../../../utils/api';

type PreviewItem = {
  sessionId: string;
  provider: string;
  projectPath: string | null;
  sessionTitle: string;
  updatedAt: string | null;
};

export default function DataSettingsTab() {
  const { t } = useTranslation('settings');
  const [days, setDays] = useState(1);
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [loading, setLoading] = useState<'preview' | 'cleanup' | null>(null);
  const [result, setResult] = useState<{
    total: number;
    deleted: number;
    removedFromDisk: number;
  } | null>(null);

  const handlePreview = async () => {
    setLoading('preview');
    setResult(null);
    try {
      const res = await api.cleanupOldSessions(days, true);
      const data = await res.json();
      const payload = data?.data ?? data;
      setPreviewItems((payload as { sessions: PreviewItem[] }).sessions ?? []);
      setPreviewTotal((payload as { total: number }).total ?? 0);
    } catch {
      setPreviewItems([]);
      setPreviewTotal(0);
    } finally {
      setLoading(null);
    }
  };

  const handleCleanup = async () => {
    if (!previewItems || previewItems.length === 0) {
      await handlePreview();
      if ((previewItems?.length ?? 0) === 0) return;
    }

    setLoading('cleanup');
    try {
      const res = await api.cleanupOldSessions(days, false);
      const data = await res.json();
      const payload = data?.data ?? data;
      setResult({
        total: (payload as { total: number }).total ?? 0,
        deleted: (payload as { deleted: number }).deleted ?? 0,
        removedFromDisk: (payload as { removedFromDisk: number }).removedFromDisk ?? 0,
      });
      setPreviewItems(null);
      setPreviewTotal(0);
    } catch {
      setResult(null);
    } finally {
      setLoading(null);
    }
  };

  const hasPreview = previewItems !== null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">{t('data.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('data.description')}</p>
      </div>

      {/* Days input */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t('data.daysLabel')}
          </label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (v >= 1) setDays(v);
            }}
            className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreview}
          disabled={loading !== null}
        >
          {loading === 'preview' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          {t('data.preview')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleCleanup}
          disabled={loading !== null || (hasPreview && previewItems.length === 0)}
        >
          {loading === 'cleanup' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          {t('data.cleanup')}
        </Button>
      </div>

      {/* Result banner */}
      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:text-emerald-300">
          <p className="font-medium">{t('data.resultTitle')}</p>
          <p className="mt-1">
            {t('data.resultSummary', {
              total: result.total,
              deleted: result.deleted,
              removedFromDisk: result.removedFromDisk,
            })}
          </p>
        </div>
      )}

      {/* Preview list */}
      {hasPreview && (
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{t('data.previewTitle')}</h4>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {previewTotal}
            </span>
          </div>

          {previewItems.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('data.noSessions')}</p>
          ) : (
            <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t('data.colTitle')}</th>
                    <th className="px-3 py-2 font-medium">{t('data.colProvider')}</th>
                    <th className="px-3 py-2 font-medium">{t('data.colProject')}</th>
                    <th className="px-3 py-2 font-medium">{t('data.colActivity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item) => (
                    <tr key={item.sessionId} className="border-b border-border/50 last:border-0">
                      <td className="max-w-[200px] truncate px-3 py-2 text-foreground">
                        {item.sessionTitle}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{item.provider}</td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-muted-foreground">
                        {item.projectPath ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {item.updatedAt
                          ? new Date(item.updatedAt).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previewItems.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{t('data.warning')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
