/**
 * One renderer per field kind.
 *
 * The dispatcher is deliberately dumb: `Field` looks at `field.kind` and hands
 * the work to a small component. Everything reads `value` and calls
 * `onChange(newValue)`, so the parent only ever holds a flat map of changed
 * paths and never has to know what any particular editor does.
 *
 * PICKERS, NOT SNOWFLAKE BOXES. A role or channel field shows the server's real
 * roles and channels. Pasting an 18-digit number is the fallback, not the
 * expectation, and it is most of the difference between a usable panel and a
 * form nobody fills in correctly.
 *
 * LABELS COME FROM THE SERVER AND ARE TRANSLATED BY PATH. `features.js` defines
 * every field in English, and `fields.<dot.path>` in the locale bundles carries
 * the translation. A field added there tomorrow therefore shows its English
 * label on a German panel instead of a raw key, and gets translated whenever
 * somebody adds the key.
 */

import { useState } from 'react';
import { PlusIcon, Trash2Icon, GripVerticalIcon } from 'lucide-react';
import { useI18n, useT } from '../i18n.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select.jsx';
import { cn } from '@/lib/utils.js';

const SNOWFLAKE = /^\d{17,20}$/;

// ── small building blocks ────────────────────────────────────────────────────

export function FieldShell({ label, help, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label className="text-xs font-semibold uppercase tracking-wide">{label}</Label>}
      {children}
      {help && <p className="text-muted-foreground text-xs leading-relaxed">{help}</p>}
    </div>
  );
}

const Row = ({ children, className }) => (
  <div className={cn('flex items-center gap-2', className)}>{children}</div>
);

/** A small card for one entry of a list editor. */
function ItemCard({ children, onRemove }) {
  const t = useT();
  return (
    <div className="border-border bg-muted/30 relative rounded-lg border p-3 pr-10">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive absolute right-2 top-2 cursor-pointer p-1"
        aria-label={t('common.remove')}
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}

const AddButton = ({ onClick, children }) => (
  <Button type="button" variant="outline" size="sm" onClick={onClick}>
    <PlusIcon /> {children}
  </Button>
);

// ── id pickers ───────────────────────────────────────────────────────────────

/**
 * A single role, channel or user.
 *
 * `options` are the server's own; an empty value means "not set", which every
 * feature treats as "leave this out" rather than as an error. A value that is
 * neither a known option nor a snowflake still shows, because it may be a NAME
 * from the roles block, which is a perfectly good reference.
 */
function IdPicker({ value, onChange, options, placeholder, allowNames = false, names = [] }) {
  const t = useT();
  const current = String(value ?? '');
  const known = options.some(o => o.id === current);
  const isName = allowNames && names.includes(current);

  // null means "decide from the data", and it stays that way until somebody
  // clicks Pick or ID. Deriving it once with useState looked equivalent and was
  // not: the guild lookups arrive AFTER the first render, so on that render
  // every configured id is unknown and the whole form came up showing raw
  // snowflakes in text boxes instead of the role names it had just fetched.
  const [manualOverride, setManualOverride] = useState(null);
  const manual = manualOverride ?? (Boolean(current) && !known && !isName);
  const setManual = setManualOverride;

  if (manual) {
    return (
      <Row>
        <Input
          value={current}
          onChange={e => onChange(e.target.value.trim())}
          placeholder={t('inputs.pasteId')}
          className={cn('font-mono', current && !SNOWFLAKE.test(current) && !isName && 'border-destructive')}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setManual(false)}>
          {t('inputs.pick')}
        </Button>
      </Row>
    );
  }

  return (
    <Row>
      <Select value={current || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t('inputs.notSet')}</SelectItem>
          {allowNames && names.map(n => (
            <SelectItem key={`name:${n}`} value={n}>{t('inputs.namedRole', { name: n })}</SelectItem>
          ))}
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>
        {t('inputs.id')}
      </Button>
    </Row>
  );
}

/** Several of them. Order does not matter, so entries are just added and removed. */
function IdListPicker({ value, onChange, options, allowNames = false, names = [], label = 'role' }) {
  const t = useT();
  const list = Array.isArray(value) ? value : [];
  const nameOf = (id) =>
    options.find(o => o.id === id)?.name ?? (names.includes(id) ? t('inputs.named', { id }) : id);

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((id, i) => (
            <span key={`${id}-${i}`} className="bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
              <span className="font-mono">{nameOf(id)}</span>
              <button
                type="button"
                onClick={() => onChange(list.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive cursor-pointer"
                aria-label={t('common.remove')}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <IdPicker
        value=""
        onChange={v => v && !list.includes(v) && onChange([...list, v])}
        options={options.filter(o => !list.includes(o.id))}
        names={names.filter(n => !list.includes(n))}
        allowNames={allowNames}
        placeholder={t('inputs.addA', { what: t(`inputs.${label}`) })}
      />
    </div>
  );
}

// ── list editors ─────────────────────────────────────────────────────────────

/** A plain list of strings: the rules, mostly. Order matters, so it can be reordered. */
function StringList({ value, onChange, placeholder }) {
  const t = useT();
  const list = Array.isArray(value) ? value : [];
  const set = (i, v) => onChange(list.map((item, idx) => (idx === i ? v : item)));
  const move = (i, by) => {
    const next = [...list];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <Row key={i}>
          <span className="text-muted-foreground w-6 shrink-0 text-right font-mono text-xs">{i + 1}.</span>
          <Textarea
            value={item}
            rows={2}
            onChange={e => set(i, e.target.value)}
            placeholder={placeholder}
            className="min-h-0"
          />
          <div className="flex shrink-0 flex-col">
            <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs" aria-label={t('common.moveUp')}>▲</button>
            <button type="button" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground cursor-pointer px-1 text-xs" aria-label={t('common.moveDown')}>▼</button>
          </div>
          <button
            type="button"
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
            className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer p-1"
            aria-label={t('common.remove')}
          ><Trash2Icon className="size-4" /></button>
        </Row>
      ))}
      <AddButton onClick={() => onChange([...list, ''])}>{t('common.add')}</AddButton>
    </div>
  );
}

/** A list of objects, each rendered by `renderItem`. */
function ObjectList({ value, onChange, blank, renderItem, addLabel }) {
  const t = useT();
  const list = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(list.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-2">
      {list.map((item, i) => (
        <ItemCard key={i} onRemove={() => onChange(list.filter((_, idx) => idx !== i))}>
          {renderItem(item, (patch) => set(i, patch), i)}
        </ItemCard>
      ))}
      <AddButton onClick={() => onChange([...list, { ...blank }])}>
        {addLabel ?? t('common.add')}
      </AddButton>
    </div>
  );
}

/** A grid of on/off switches over an object of booleans. */
function ToggleGrid({ value, onChange, labels = {} }) {
  const t = useT();
  const obj = value && typeof value === 'object' ? value : {};
  const keys = Object.keys(obj);
  if (!keys.length) return <p className="text-muted-foreground text-sm">{t('inputs.nothingToSwitch')}</p>;

  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map(key => (
        <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="truncate">{labels[key] ?? key}</span>
          <Switch checked={obj[key] !== false} onCheckedChange={v => onChange({ ...obj, [key]: v })} />
        </label>
      ))}
    </div>
  );
}

/** An object of hex colours. */
function ColorMap({ value, onChange }) {
  const obj = value && typeof value === 'object' ? value : {};
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.keys(obj).map(key => (
        <FieldShell key={key} label={key}>
          <ColorInput value={obj[key]} onChange={v => onChange({ ...obj, [key]: v })} />
        </FieldShell>
      ))}
    </div>
  );
}

function ColorInput({ value, onChange }) {
  const t = useT();
  const hex = /^#[0-9a-fA-F]{6}$/.test(String(value ?? '')) ? value : '#5865f2';
  return (
    <Row>
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value)}
        className="border-border size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
        aria-label={t('inputs.colour')}
      />
      <Input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="#5865f2" className="font-mono" />
    </Row>
  );
}

/** The named-roles block: a name on the left, a role on the right. */
function RoleMap({ value, onChange, roles }) {
  const t = useT();
  const obj = value && typeof value === 'object' ? value : {};
  const [newName, setNewName] = useState('');

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.keys(obj).map(key => (
          <FieldShell key={key} label={key}>
            <Row>
              <div className="min-w-0 flex-1">
                <IdPicker value={obj[key]} onChange={v => onChange({ ...obj, [key]: v })} options={roles} placeholder={t('inputs.pickRole')} />
              </div>
              <button
                type="button"
                onClick={() => { const next = { ...obj }; delete next[key]; onChange(next); }}
                className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer p-1"
                aria-label={t('common.remove')}
              ><Trash2Icon className="size-4" /></button>
            </Row>
          </FieldShell>
        ))}
      </div>
      <Row>
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder={t('inputs.newName')}
          className="max-w-xs"
        />
        <AddButton onClick={() => { if (newName && !(newName in obj)) { onChange({ ...obj, [newName]: '' }); setNewName(''); } }}>
          {t('inputs.addName')}
        </AddButton>
      </Row>
    </div>
  );
}

/** One bot's presence: on/off, text, type, status. */
const ACTIVITY_TYPES = ['PLAYING', 'WATCHING', 'LISTENING', 'STREAMING', 'COMPETING', 'CUSTOM'];
const STATUSES = ['online', 'idle', 'dnd', 'invisible'];

function PresenceEditor({ value, onChange }) {
  const t = useT();
  const p = value && typeof value === 'object' ? value : {};
  const set = (patch) => onChange({ ...p, ...patch });

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>{t('inputs.showStatus')}</span>
        <Switch checked={p.enabled !== false} onCheckedChange={v => set({ enabled: v })} />
      </label>
      {p.enabled !== false && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldShell label={t('inputs.statusText')} className="sm:col-span-3">
            <Input value={p.text ?? ''} onChange={e => set({ text: e.target.value })} placeholder={t('inputs.statusEmpty')} />
          </FieldShell>
          <FieldShell label={t('inputs.activityType')}>
            <Select value={p.type ?? 'PLAYING'} onValueChange={v => set({ type: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{ACTIVITY_TYPES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </FieldShell>
          <FieldShell label={t('inputs.presence')}>
            <Select value={p.status ?? 'online'} onValueChange={v => set({ status: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </FieldShell>
          {p.type === 'STREAMING' && (
            <FieldShell label={t('inputs.streamUrl')}>
              <Input value={p.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder="https://twitch.tv/..." />
            </FieldShell>
          )}
        </div>
      )}
    </div>
  );
}

/** The point values, one card per game. */
function PointsMatrix({ value, onChange }) {
  const games = value && typeof value === 'object' ? value : {};

  const setLeaf = (game, pathParts, num) => {
    const next = structuredClone(games);
    let node = next[game];
    for (const part of pathParts.slice(0, -1)) node = node[part];
    node[pathParts.at(-1)] = num;
    onChange(next);
  };

  const leaves = (obj, prefix = []) => Object.entries(obj).flatMap(([k, v]) =>
    (v && typeof v === 'object' ? leaves(v, [...prefix, k]) : [[[...prefix, k], v]]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(games).map(([game, outcomes]) => (
        <div key={game} className="border-border bg-muted/30 rounded-lg border p-3">
          <div className="mb-2 font-mono text-xs font-bold uppercase tracking-wide">{game}</div>
          <div className="space-y-1.5">
            {leaves(outcomes).map(([parts, num]) => (
              <Row key={parts.join('.')} className="justify-between">
                <span className="text-muted-foreground truncate text-xs">{parts.join(' · ')}</span>
                <Input
                  type="number"
                  value={Number(num) || 0}
                  onChange={e => setLeaf(game, parts, Number(e.target.value) || 0)}
                  className="h-7 w-20 text-right tabular-nums"
                />
              </Row>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── the dispatcher ───────────────────────────────────────────────────────────

const BUTTON_STYLES = ['Primary', 'Secondary', 'Success', 'Danger'];

export function Field({ field, value, onChange, lookups, roleNames, languages, disabled }) {
  const { t, tOr } = useI18n();
  const { kind } = field;
  const roles = lookups?.roles ?? [];
  const channels = lookups?.channels ?? [];

  // `translate: false` is for a label the caller already translated, which is
  // the feature toggle: its text is built from the feature's own name.
  const label = field.translate === false || !field.path
    ? field.label
    : tOr(`fields.${field.path}.label`, field.label);
  const help = field.help && field.path ? tOr(`fields.${field.path}.help`, field.help) : field.help;

  const wrap = (children) => (
    <FieldShell label={label} help={help}>
      <fieldset disabled={disabled} className={cn(disabled && 'opacity-60')}>{children}</fieldset>
    </FieldShell>
  );

  switch (kind) {
    case 'toggle':
      return (
        <FieldShell help={help}>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="font-medium">{label}</span>
            <Switch checked={value !== false} onCheckedChange={onChange} disabled={disabled} />
          </label>
        </FieldShell>
      );

    case 'text':
    case 'url':
      return wrap(<Input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={kind === 'url' ? 'https://…' : ''} />);

    case 'textarea':
      return wrap(<Textarea value={value ?? ''} rows={4} onChange={e => onChange(e.target.value)} />);

    case 'number':
      return wrap(
        <Input
          type="number"
          value={Number(value) || 0}
          min={field.min}
          max={field.max}
          onChange={e => onChange(Number(e.target.value) || 0)}
          className="max-w-[10rem] tabular-nums"
        />,
      );

    case 'color':
      return wrap(<ColorInput value={value} onChange={onChange} />);

    case 'language':
      return wrap(
        <Select value={value ?? 'en'} onValueChange={onChange}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(languages ?? [{ code: 'en', name: 'English' }]).map(l => (
              <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>,
      );

    case 'buttonStyle':
      return wrap(
        <Select value={value ?? 'Secondary'} onValueChange={onChange}>
          <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{BUTTON_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>,
      );

    case 'role':
      return wrap(<IdPicker value={value} onChange={onChange} options={roles} names={roleNames} allowNames placeholder={t('inputs.pickRole')} />);

    case 'channel':
      return wrap(<IdPicker value={value} onChange={onChange} options={channels} placeholder={t('inputs.pickChannel')} />);

    case 'user':
      return wrap(
        <Input
          value={value ?? ''}
          onChange={e => onChange(e.target.value.trim())}
          placeholder={t('inputs.userId')}
          className={cn('font-mono max-w-sm', value && !SNOWFLAKE.test(String(value)) && 'border-destructive')}
        />,
      );

    case 'roleList':
      return wrap(<IdListPicker value={value} onChange={onChange} options={roles} names={roleNames} allowNames label="role" />);

    case 'channelList':
      return wrap(<IdListPicker value={value} onChange={onChange} options={channels} label="channel" />);

    case 'idList':
      return wrap(
        <StringList value={value} onChange={v => onChange(v.map(s => s.trim()).filter(Boolean))} placeholder={t('inputs.userId')} />,
      );

    case 'stringList':
      return wrap(<StringList value={value} onChange={onChange} />);

    case 'roleMap':
      return wrap(<RoleMap value={value} onChange={onChange} roles={roles} />);

    case 'colorMap':
      return wrap(<ColorMap value={value} onChange={onChange} />);

    case 'eventGrid':
    case 'gameGrid':
      return wrap(<ToggleGrid value={value} onChange={onChange} />);

    case 'pointsMatrix':
      return wrap(<PointsMatrix value={value} onChange={onChange} />);

    case 'presence':
      return wrap(<PresenceEditor value={value} onChange={onChange} />);

    case 'linkList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ label: '', url: '' }}
          addLabel={t('inputs.addLink')}
          renderItem={(item, set) => (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <Input value={item.label ?? ''} onChange={e => set({ label: e.target.value })} placeholder={t('inputs.linkLabel')} />
              <Input value={item.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder="https://…" />
            </div>
          )}
        />,
      );

    case 'sectionList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ heading: '', text: '', channel: '' }}
          addLabel={t('inputs.addSection')}
          renderItem={(item, set) => (
            <div className="space-y-2">
              <Input value={item.heading ?? ''} onChange={e => set({ heading: e.target.value })} placeholder={t('inputs.heading')} />
              <Textarea value={item.text ?? ''} rows={3} onChange={e => set({ text: e.target.value })} placeholder={t('inputs.sectionText')} />
              <IdPicker value={item.channel} onChange={v => set({ channel: v })} options={channels} placeholder={t('inputs.channelOptional')} />
            </div>
          )}
        />,
      );

    case 'roleLineList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ role: '', text: '' }}
          addLabel={t('inputs.addRoleLine')}
          renderItem={(item, set) => (
            <div className="space-y-2">
              <IdPicker value={item.role} onChange={v => set({ role: v })} options={roles} names={roleNames} allowNames placeholder={t('inputs.pickRole')} />
              <Input value={item.text ?? ''} onChange={e => set({ text: e.target.value })} placeholder={t('inputs.roleMeaning')} />
            </div>
          )}
        />,
      );

    case 'roleButtonList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ id: '', label: '', emoji: '', style: 'Secondary', role: '' }}
          addLabel={t('inputs.addButton')}
          renderItem={(item, set) => (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_9rem]">
                <Input value={item.id ?? ''} onChange={e => set({ id: e.target.value.replace(/[^a-z0-9_]/g, '') })} placeholder="id" className="font-mono" />
                <Input value={item.label ?? ''} onChange={e => set({ label: e.target.value })} placeholder={t('inputs.linkLabel')} />
                <Input value={item.emoji ?? ''} onChange={e => set({ emoji: e.target.value })} placeholder={t('inputs.emoji')} />
                <Select value={item.style ?? 'Secondary'} onValueChange={v => set({ style: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{BUTTON_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <IdPicker value={item.role} onChange={v => set({ role: v })} options={roles} names={roleNames} allowNames placeholder={t('inputs.pickRole')} />
              <p className="text-muted-foreground text-xs">{t('inputs.buttonIdWarning')}</p>
            </div>
          )}
        />,
      );

    case 'guideList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ value: '', name: '', title: '', description: '' }}
          addLabel={t('inputs.addGuide')}
          renderItem={(item, set) => (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={item.value ?? ''} onChange={e => set({ value: e.target.value.replace(/[^a-z0-9_]/g, '') })} placeholder="id" className="font-mono" />
                <Input value={item.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder={t('inputs.guideMenuName')} />
              </div>
              <Input value={item.title ?? ''} onChange={e => set({ title: e.target.value })} placeholder={t('inputs.guideTitle')} />
              <Textarea value={item.description ?? ''} rows={4} onChange={e => set({ description: e.target.value })} placeholder={t('inputs.guideBody')} />
            </div>
          )}
        />,
      );

    case 'rewardList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ points: 100, label: '', role: '' }}
          addLabel={t('inputs.addTier')}
          renderItem={(item, set) => (
            <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
              <Input
                type="number"
                value={Number(item.points) || 0}
                onChange={e => set({ points: Number(e.target.value) || 0 })}
                className="tabular-nums"
              />
              <Input value={item.label ?? ''} onChange={e => set({ label: e.target.value })} placeholder={t('inputs.linkLabel')} />
              <IdPicker value={item.role} onChange={v => set({ role: v })} options={roles} names={roleNames} allowNames placeholder={t('inputs.roleOptional')} />
            </div>
          )}
        />,
      );

    case 'multiplierList':
      return wrap(
        <ObjectList
          value={value}
          onChange={onChange}
          blank={{ role: '', factor: 2 }}
          addLabel={t('inputs.addBonusRole')}
          renderItem={(item, set) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
              <IdPicker value={item.role} onChange={v => set({ role: v })} options={roles} names={roleNames} allowNames placeholder={t('inputs.pickRole')} />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">x</span>
                <Input
                  type="number"
                  min={1}
                  step={0.5}
                  value={Number(item.factor) || 0}
                  onChange={e => set({ factor: Number(e.target.value) || 0 })}
                  className="tabular-nums"
                />
              </div>
            </div>
          )}
        />,
      );

    case 'contextMenus':
      return wrap(<ContextMenus value={value} onChange={onChange} roles={roles} roleNames={roleNames} />);

    case 'commandTable':
      return wrap(<CommandTable value={value} onChange={onChange} roles={roles} roleNames={roleNames} />);

    default:
      return wrap(
        <Textarea
          value={typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)}
          rows={4}
          onChange={e => {
            try { onChange(JSON.parse(e.target.value)); } catch { /* keep typing */ }
          }}
          className="font-mono text-xs"
        />,
      );
  }
}

function ContextMenus({ value, onChange, roles, roleNames }) {
  const t = useT();
  const obj = value && typeof value === 'object' ? value : {};
  const set = (key, patch) => onChange({ ...obj, [key]: { ...obj[key], ...patch } });

  return (
    <div className="space-y-2">
      {Object.entries(obj).map(([key, menu]) => (
        <div key={key} className="border-border bg-muted/30 rounded-lg border p-3">
          <Row className="mb-2 justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wide">{key}</span>
            <Switch checked={menu?.enabled !== false} onCheckedChange={v => set(key, { enabled: v })} />
          </Row>
          {menu?.enabled !== false && (
            <div className="space-y-2">
              <Input value={menu?.name ?? ''} onChange={e => set(key, { name: e.target.value })} placeholder={t('inputs.menuName')} />
              <IdListPicker
                value={menu?.roles}
                onChange={v => set(key, { roles: v })}
                options={roles}
                names={roleNames}
                allowNames
                label="role"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The command table.
 *
 * Renaming is safe: registration and routing both read this table. What is NOT
 * safe is leaving the roles list empty by accident, so the empty case says out
 * loud that it means everyone.
 */
function CommandTable({ value, onChange, roles, roleNames }) {
  const t = useT();
  const obj = value && typeof value === 'object' ? value : {};
  const [filter, setFilter] = useState('');
  const set = (key, patch) => onChange({ ...obj, [key]: { ...obj[key], ...patch } });

  const keys = Object.keys(obj).filter(k => k.includes(filter.toLowerCase()));

  return (
    <div className="space-y-3">
      <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('inputs.filterCommands')} className="max-w-xs" />
      <div className="space-y-2">
        {keys.map(key => {
          const cmd = obj[key] ?? {};
          const restricted = Array.isArray(cmd.roles) && cmd.roles.length > 0;
          return (
            <div key={key} className="border-border bg-muted/30 rounded-lg border p-3">
              <Row className="mb-2 justify-between">
                <span className="font-mono text-xs font-bold">/{key}</span>
                <Row className="gap-2">
                  <span className="text-muted-foreground text-xs">
                    {restricted ? t('inputs.restricted') : t('inputs.everyone')}
                  </span>
                  <Switch checked={cmd.enabled !== false} onCheckedChange={v => set(key, { enabled: v })} />
                </Row>
              </Row>
              {cmd.enabled !== false && (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                    <Input
                      value={cmd.name ?? key}
                      onChange={e => set(key, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                      className="font-mono"
                      placeholder={key}
                    />
                    <Input
                      value={cmd.description ?? ''}
                      onChange={e => set(key, { description: e.target.value })}
                      placeholder={t('inputs.shippedWording')}
                    />
                  </div>
                  <IdListPicker
                    value={cmd.roles}
                    onChange={v => set(key, { roles: v })}
                    options={roles}
                    names={roleNames}
                    allowNames
                    label="role"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { IdPicker, IdListPicker, StringList, ObjectList, ColorInput, GripVerticalIcon };
