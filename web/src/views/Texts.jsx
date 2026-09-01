import { useCallback, useEffect, useMemo, useState } from 'react';
import { SaveIcon, RotateCcwIcon, SearchIcon, FilterIcon } from 'lucide-react';
import { api } from '../api.js';
import { Banner, SectionTitle } from '../ui.jsx';
import { useI18n, useT } from '../i18n.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { cn } from '@/lib/utils.js';

/**
 * Every message the bot can say, with what it says now and what it shipped with.
 *
 * A change is stored as an OVERRIDE, not by editing the translation: an update
 * ships its own locale files, and an edit made there would be overwritten or
 * would turn the next deploy into a merge conflict.
 *
 * Emptying a field means "back to the shipped wording", which is a removal
 * rather than an override that happens to be blank. A blank embed field is
 * refused by Discord, so an empty override would be a message that fails to
 * send rather than one that says nothing.
 */
export default function Texts({ me }) {
  const canEdit = me.isOwner || me.permissions.includes('config.edit');
  const { t } = useI18n();

  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [query, setQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.texts()); } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();

    const matching = data.entries.filter((e) => {
      if (onlyChanged && !e.overridden && !(e.key in draft)) return false;
      if (!needle) return true;
      return e.key.toLowerCase().includes(needle)
        || String(e.current ?? '').toLowerCase().includes(needle);
    });

    // Grouped by the first path segment, which is how the catalogue is laid out
    // anyway: common, commands, games, logging and so on.
    const byGroup = new Map();
    for (const entry of matching) {
      const group = entry.key.split('.')[0];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(entry);
    }
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, query, onlyChanged, draft]);

  if (error && !data) return <Banner type="error" onClose={() => setError(null)}>{error}</Banner>;
  if (!data) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;

  const dirty = Object.keys(draft).length > 0;
  const changedCount = data.entries.filter(e => e.overridden).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patchTexts(draft);
      setDraft({});
      setNotice(t('common.restartHint'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>{t('texts.title')}</SectionTitle>
          <p className="text-muted-foreground text-sm">
            {t('texts.subtitle', { total: data.entries.length, changed: changedCount })}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {dirty && <Button variant="outline" onClick={() => setDraft({})}><RotateCcwIcon /> {t('common.discard')}</Button>}
            <Button onClick={save} disabled={!dirty || saving}>
              <SaveIcon /> {saving ? t('common.saving') : t('texts.saveCount', { count: Object.keys(draft).length })}
            </Button>
          </div>
        )}
      </div>

      {error && <Banner type="error" onClose={() => setError(null)}>{error}</Banner>}
      {notice && <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>}
      {!canEdit && <Banner type="info">{t('common.readOnly')}</Banner>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('texts.search')}
            className="pl-9"
          />
        </div>
        <Button
          variant={onlyChanged ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOnlyChanged(v => !v)}
        >
          <FilterIcon /> {t('texts.onlyChanged')}
        </Button>
      </div>

      {groups.length === 0 && <p className="text-muted-foreground text-sm">{t('texts.nothingMatches')}</p>}

      <div className="space-y-4">
        {groups.map(([group, entries]) => (
          <Card key={group}>
            <CardContent className="space-y-3 py-4">
              <div className="font-mono text-xs font-bold uppercase tracking-wide">{group}</div>
              {entries.map(entry => (
                <Entry
                  key={entry.key}
                  entry={entry}
                  draft={draft}
                  canEdit={canEdit}
                  onChange={(v) => setDraft(d => ({ ...d, [entry.key]: v }))}
                  onClear={() => setDraft(d => {
                    const next = { ...d };
                    delete next[entry.key];
                    return next;
                  })}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Entry({ entry, draft, canEdit, onChange, onClear }) {
  const t = useT();
  const edited = entry.key in draft;
  const value = edited ? draft[entry.key] : entry.current;

  // Lists (the 8-ball answers, the word lists) and the trivia questions are not
  // single strings, so they are shown as JSON rather than pretended to be text.
  const isText = typeof entry.current === 'string';
  const shown = isText ? (value ?? '') : JSON.stringify(value ?? entry.current, null, 2);
  const long = isText ? String(shown).length > 80 || String(shown).includes('\n') : true;

  return (
    <div className={cn('border-border rounded-lg border p-3', edited && 'border-primary/50')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <code className="text-muted-foreground text-xs">{entry.key}</code>
        {entry.overridden && <Badge variant="muted" className="text-[10px]">{t('texts.changed')}</Badge>}
        {edited && <Badge variant="success" className="text-[10px]">{t('texts.unsaved')}</Badge>}
      </div>

      {long ? (
        <Textarea
          value={shown}
          rows={Math.min(10, String(shown).split('\n').length + 1)}
          readOnly={!canEdit || !isText}
          onChange={e => onChange(e.target.value)}
          className={cn('font-mono text-xs', !isText && 'opacity-70')}
        />
      ) : (
        <Input value={shown} readOnly={!canEdit} onChange={e => onChange(e.target.value)} />
      )}

      {!isText && (
        <p className="text-muted-foreground mt-1 text-xs">
          {t('texts.listHint')}
        </p>
      )}

      {edited && (
        <div className="mt-2 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear}>{t('common.undo')}</Button>
          {isText && shown !== '' && (
            <Button variant="ghost" size="sm" onClick={() => onChange('')}>
              {t('texts.backToShipped')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
