import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PaletteIcon, ActivityIcon, UsersIcon, ScrollTextIcon, HashIcon, MessageSquareIcon,
  ReplyIcon, InfoIcon, GavelIcon, TagsIcon, BookOpenIcon, DicesIcon, Gamepad2Icon,
  SmileIcon, IdCardIcon, ShieldIcon, TerminalIcon, ArrowLeftIcon, SaveIcon,
  RotateCcwIcon, FileCodeIcon, AlertTriangleIcon,
} from 'lucide-react';
import { api } from '../api.js';
import { Banner, FeatureState, SectionTitle } from '../ui.jsx';
import { Field } from '../config/inputs.jsx';
import { useI18n } from '../i18n.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.jsx';
import { cn } from '@/lib/utils.js';

const ICONS = {
  palette: PaletteIcon, activity: ActivityIcon, users: UsersIcon, scroll: ScrollTextIcon,
  hash: HashIcon, message: MessageSquareIcon, reply: ReplyIcon, info: InfoIcon,
  gavel: GavelIcon, tags: TagsIcon, book: BookOpenIcon, dice: DicesIcon,
  gamepad: Gamepad2Icon, smile: SmileIcon, idcard: IdCardIcon, shield: ShieldIcon,
  terminal: TerminalIcon,
};

/** Read a dot path out of a nested object. */
function getPath(object, dotted) {
  let node = object;
  for (const key of String(dotted).split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

const STATE_ORDER = { incomplete: 0, ready: 1, off: 2 };

export default function Config({ me, featureId, onOpen, onClose }) {
  const canEdit = me.isOwner || me.permissions.includes('config.edit');
  const { t, tOr, tn } = useI18n();

  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.status(), api.config()]);
      setStatus(s);
      setConfig(c);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The pickers are a nice-to-have: the Discord call can fail while the bot is
  // stopped or the token is wrong, and every field still has to work.
  useEffect(() => {
    api.guild().then(setLookups).catch(err => setLookupError(err.message));
  }, []);

  const feature = useMemo(
    () => status?.features.find(f => f.id === featureId) ?? null,
    [status, featureId],
  );

  if (error) return <Banner type="error" onClose={() => setError(null)}>{error}</Banner>;
  if (!status || !config) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;

  if (feature) {
    return (
      <FeatureDetail
        feature={feature}
        config={config}
        lookups={lookups}
        lookupError={lookupError}
        languages={status.languages}
        canEdit={canEdit}
        onBack={onClose}
        onSaved={async (message) => { setNotice(message); await load(); }}
      />
    );
  }

  // Sorted by the label the reader actually sees, so a German panel is in
  // German alphabetical order rather than in the server's English one.
  const labelOf = (tile) => tOr(`features.${tile.id}.label`, tile.label);
  const tiles = [...status.features].sort(
    (a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || labelOf(a).localeCompare(labelOf(b)),
  );
  const incomplete = tiles.filter(t => t.state === 'incomplete');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>{t('config.title')}</SectionTitle>
          <p className="text-muted-foreground text-sm">{t('config.subtitle')}</p>
        </div>
        <RawEditorButton config={config} canEdit={canEdit} onSaved={load} />
      </div>

      {notice && <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>}

      {!status.configExists && <Banner type="info">{t('config.noConfigFile')}</Banner>}
      {status.configError && <Banner type="error">{status.configError}</Banner>}
      {status.guildMissing && <Banner type="error">{t('config.guildMissing')}</Banner>}
      {lookupError && (
        <Banner type="info">{t('config.lookupsUnavailable', { error: lookupError })}</Banner>
      )}

      {incomplete.length > 0 && (
        <Banner type="info">{tn('config.incompleteBanner', incomplete.length)}</Banner>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(tile => {
          const Icon = ICONS[tile.icon] ?? SlidersFallback;
          return (
            <button
              key={tile.id}
              onClick={() => onOpen(tile.id)}
              className={cn(
                'border-border bg-card hover:border-primary/40 group cursor-pointer rounded-xl border p-4 text-left transition-colors',
                tile.state === 'incomplete' && 'border-warn/40',
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-4.5" />
                </span>
                <FeatureState state={tile.state} />
              </div>
              <div className="font-display text-sm font-bold">{labelOf(tile)}</div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {tOr(`features.${tile.id}.description`, tile.description)}
              </p>
              {tile.missing.length > 0 && (
                <p className="text-warn mt-2 flex items-center gap-1.5 text-xs">
                  <AlertTriangleIcon className="size-3.5 shrink-0" />
                  {tn('config.missingCount', tile.missing.length)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SlidersFallback = (props) => <TerminalIcon {...props} />;

// ── one feature ──────────────────────────────────────────────────────────────

function FeatureDetail({ feature, config, lookups, lookupError, languages, canEdit, onBack, onSaved }) {
  // The draft is a flat map of CHANGED paths only, which is exactly the shape
  // the API wants. Nothing unchanged is ever sent, so a save cannot pin a value
  // somebody never touched.
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { t, tOr } = useI18n();

  const roleNames = Object.keys(config.effective?.roles ?? {});
  const label = tOr(`features.${feature.id}.label`, feature.label);

  const valueOf = (path) => (path in draft ? draft[path] : getPath(config.effective, path));
  const change = (path, value) => setDraft(d => ({ ...d, [path]: value }));

  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patchConfig(draft);
      setDraft({});
      await onSaved(t('common.restartHint'));
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const enabled = feature.toggle ? valueOf(feature.toggle) !== false : true;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('common.back')}>
            <ArrowLeftIcon />
          </Button>
          <div>
            <SectionTitle>{label}</SectionTitle>
            <p className="text-muted-foreground text-sm">
              {tOr(`features.${feature.id}.description`, feature.description)}
            </p>
            {feature.command && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {t('config.postedBy', { command: feature.command })}
              </p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {dirty && (
              <Button variant="outline" onClick={() => setDraft({})}>
                <RotateCcwIcon /> {t('common.discard')}
              </Button>
            )}
            <Button onClick={save} disabled={!dirty || saving}>
              <SaveIcon /> {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        )}
      </div>

      {error && <Banner type="error" onClose={() => setError(null)}>{error}</Banner>}
      {!canEdit && <Banner type="info">{t('common.readOnly')}</Banner>}
      {lookupError && (
        <Banner type="info">{t('config.lookupsUnavailableShort', { error: lookupError })}</Banner>
      )}

      {feature.missing.length > 0 && enabled && (
        <Banner type="info">{t('config.missingList', { list: feature.missing.join(', ') })}</Banner>
      )}

      {feature.toggle && (
        <Card>
          <CardContent className="py-4">
            <Field
              field={{
                kind: 'toggle',
                label: t('config.enabledToggle', { label }),
                path: feature.toggle,
                translate: false,
              }}
              value={valueOf(feature.toggle)}
              onChange={v => change(feature.toggle, v)}
              disabled={!canEdit}
            />
          </CardContent>
        </Card>
      )}

      {feature.fields.length > 0 ? (
        <Card>
          <CardContent className="space-y-5 py-5">
            {feature.fields
              .filter(f => f.path !== feature.toggle)
              .map(f => (
                <Field
                  key={f.path}
                  field={f}
                  value={valueOf(f.path)}
                  onChange={v => change(f.path, v)}
                  lookups={lookups}
                  roleNames={roleNames}
                  languages={languages}
                  disabled={!canEdit || !enabled}
                />
              ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">{t('config.nothingElse')}</p>
      )}
    </div>
  );
}

// ── the raw editor ───────────────────────────────────────────────────────────

/**
 * The escape hatch.
 *
 * The form rewrites config.jsonc as plain JSON, so hand-written comments do not
 * survive it. This one writes the text byte for byte, which is the only way to
 * keep them, and it is also the way out when a setting has no field yet.
 */
function RawEditorButton({ config, canEdit, onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  const start = () => {
    setText(config.raw || '{\n}\n');
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.putConfigRaw(text);
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={start}>
        <FileCodeIcon /> {t('config.rawEditor')}
      </Button>
    );
  }

  return (
    <div className="bg-background/90 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="border-border bg-card flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-xl border p-4">
        <Tabs defaultValue="own" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="own">{t('config.ownFile')}</TabsTrigger>
              <TabsTrigger value="example">{t('config.shippedDefaults')}</TabsTrigger>
            </TabsList>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.close')}</Button>
          </div>

          {error && <Banner type="error" onClose={() => setError(null)}>{error}</Banner>}

          <TabsContent value="own" className="mt-3 min-h-0 flex-1">
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              readOnly={!canEdit}
              spellCheck={false}
              className="h-[60vh] font-mono text-xs"
            />
          </TabsContent>
          <TabsContent value="example" className="mt-3 min-h-0 flex-1">
            <Textarea
              value={config.example}
              readOnly
              spellCheck={false}
              className="h-[60vh] font-mono text-xs opacity-80"
            />
          </TabsContent>
        </Tabs>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              <SaveIcon /> {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
