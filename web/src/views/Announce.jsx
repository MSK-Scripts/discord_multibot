import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SendIcon, HashIcon, MegaphoneIcon, TriangleAlertIcon, ChevronDownIcon, ChevronRightIcon,
  BookmarkIcon, Trash2Icon, UsersIcon, LockIcon, SaveIcon,
} from 'lucide-react';
import { api } from '../api.js';
import { Banner, SectionTitle } from '../ui.jsx';
import { useI18n } from '../i18n.jsx';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select.jsx';

/**
 * Writing an announcement and posting it into a channel AS THE BOT.
 *
 * THE TWO MODES ARE THE TWO COMMANDS. "Text" is what /send_message posts and
 * "Embed" is what /send_embed posts, through the same builder in
 * core/messageComposer.js, so a message written here is the message the bot
 * would have posted from Discord. The embed fields below are exactly the ones
 * that command's modal offers.
 *
 * Two more things here are deliberate rather than decorative.
 *
 * The PREVIEW is what makes this safe to use: an announcement goes to everyone
 * at once and cannot be unsent, so seeing it beats sending it to a test channel
 * first. It is an approximation, not a renderer: Discord's markdown is not
 * reimplemented here, and the panel says so.
 *
 * The CONFIRM STEP only appears for @everyone and @here. A mis-click there
 * notifies the whole server, which is the one action on this screen nobody can
 * take back, so it costs a second click. Everything else posts on the first.
 *
 * TEMPLATES ARE COPIED IN, NOT LINKED. Picking one fills the form and the
 * connection ends there, so what goes out is always what is on screen. A live
 * link would mean somebody editing a shared template could change a message
 * another person is halfway through writing.
 *
 * "Write it yourself" is the default and stays selectable, because a template
 * is a shortcut and never a step you have to go through.
 */

const STORAGE_KEY = 'mb.announce.channel';
/** Radix reserves the empty string, so the "no template" option needs a real value. */
const OWN = '__own__';
const LIMITS = { title: 256, description: 4096, content: 2000 };

/** Discord's own channel types: 0 is text, 5 is announcement. */
const POSTABLE = new Set([0, 5]);

const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
};
const store = (id) => {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private window, not worth a word */ }
};

/** "#5865F2" to something the preview's accent bar can use. */
const barColor = (hex) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : 'var(--primary)');

export default function Announce({ me }) {
  const { t } = useI18n();

  const [lookups, setLookups] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Two flags, not one. Saving a template used to flip the Post button to
  // "posting...", which reads as "you just sent it" for the one action on this
  // screen that cannot be taken back.
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [more, setMore] = useState(false);
  const [templates, setTemplates] = useState([]);
  // Always "write it yourself" on arrival. A template is a shortcut, never a
  // step somebody has to go through.
  const [templateId, setTemplateId] = useState(OWN);
  const [templateName, setTemplateName] = useState('');
  const [templateShared, setTemplateShared] = useState(false);

  const [channelId, setChannelId] = useState(readStored);
  const [mode, setMode] = useState('embed');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ping, setPing] = useState('none');
  const [roleId, setRoleId] = useState('');
  const [color, setColor] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [image, setImage] = useState('');

  // Prefilled the way /send_embed prefills its modal, so clearing the field
  // means "no footer" and leaving it means the usual one. Computed once during
  // the first render: a value derived from props does not belong in an effect.
  const [footer, setFooter] = useState(() => {
    const name = me?.guild?.name ?? '';
    return name ? `© ${name} • ${new Date().toLocaleString()}` : '';
  });

  useEffect(() => {
    api.guild()
      .then(setLookups)
      .catch(e => { setLookups({ roles: [], channels: [] }); setError(e.message); });
  }, []);

  const loadTemplates = useCallback(async () => {
    try { setTemplates((await api.templates()).templates); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const channels = useMemo(
    () => (lookups?.channels ?? []).filter(c => POSTABLE.has(c.type)),
    [lookups],
  );
  const channel = channels.find(c => c.id === channelId) ?? null;
  const role = (lookups?.roles ?? []).find(r => r.id === roleId) ?? null;

  const isEmbed = mode === 'embed';
  const loud = ping === 'everyone' || ping === 'here';
  const max = isEmbed ? LIMITS.description : LIMITS.content;
  const overLong = body.length > max || (isEmbed && title.length > LIMITS.title);
  const ready = Boolean(channelId) && body.trim().length > 0 && !overLong
    && (ping !== 'role' || Boolean(roleId));

  // Any edit withdraws a pending confirmation, so the second click always
  // agrees to the text that is on screen now.
  const edit = (setter) => (value) => { setConfirming(false); setter(value); };

  /**
   * Copy a template into the form. The link ends here on purpose: what gets
   * posted is always what is on screen, never what the template says now.
   */
  const applyTemplate = (id) => {
    setConfirming(false);
    setTemplateId(id);
    if (id === OWN) return;
    const tpl = templates.find(x => x.id === id);
    if (!tpl) return;
    setMode(tpl.mode === 'text' ? 'text' : 'embed');
    setTitle(tpl.title ?? '');
    setBody(tpl.body ?? '');
    setThumbnail(tpl.thumbnail ?? '');
    setImage(tpl.image ?? '');
    setFooter(tpl.footer ?? '');
    setColor(tpl.color ?? '');
    setPing(tpl.ping ?? 'none');
    setRoleId(tpl.roleId ?? '');
    setTemplateName(tpl.name);
    setTemplateShared(tpl.shared === true);
    if (tpl.thumbnail || tpl.image || tpl.footer || tpl.color) setMore(true);
  };

  /** Save the form as a template. With an id it overwrites, without it creates. */
  const saveTemplate = async (id = '') => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await api.saveTemplate({
        id, name: templateName, shared: templateShared,
        mode, title, body, ping, roleId, color, thumbnail, image, footer,
      });
      await loadTemplates();
      setTemplateId(saved.template.id);
      setNotice(t('announce.templateSaved', { name: saved.template.name }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (id) => {
    setBusy(true); setError(null);
    try {
      await api.deleteTemplate(id);
      if (templateId === id) setTemplateId(OWN);
      await loadTemplates();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const selected = templates.find(x => x.id === templateId) ?? null;

  const post = async () => {
    if (loud && !confirming) { setConfirming(true); return; }
    setPosting(true); setError(null); setNotice(null); setConfirming(false);
    try {
      const result = await api.announce({
        channelId, mode, title, body, ping, roleId, color,
        // Only meaningful for an embed, and sending them in text mode would
        // put fields in the request that the composer has no use for.
        ...(isEmbed ? { thumbnail, image, footer } : {}),
      });
      store(channelId);
      setNotice(result.url ? `${t('announce.posted')} ${result.url}` : t('announce.posted'));
      setTitle(''); setBody(''); setTemplateId(OWN);
    } catch (e) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const ModeButton = ({ value, label, hint }) => (
    <button
      type="button"
      onClick={() => edit(setMode)(value)}
      className={cn(
        'flex-1 cursor-pointer rounded-md border px-3 py-2 text-left transition-colors',
        mode === value
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">{hint}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <SectionTitle>{t('announce.title')}</SectionTitle>

      <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('announce.composeTitle')}</CardTitle>
            <CardDescription>{t('announce.composeHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('announce.source')}</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={OWN}>{t('announce.writeMyself')}</SelectItem>
                  {templates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      <span className="flex items-center gap-1.5">
                        {tpl.shared ? <UsersIcon className="size-3.5 opacity-70" /> : <LockIcon className="size-3.5 opacity-70" />}
                        {tpl.name}
                        {!tpl.mine && tpl.owner?.name && (
                          <span className="text-muted-foreground text-xs">{tpl.owner.name}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templateId !== OWN && (
                <p className="text-muted-foreground text-xs">{t('announce.copiedHint')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('announce.channel')}</Label>
              <Select value={channelId} onValueChange={edit(setChannelId)}>
                <SelectTrigger><SelectValue placeholder={t('announce.pickChannel')} /></SelectTrigger>
                <SelectContent>
                  {channels.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        {c.type === 5 ? <MegaphoneIcon className="size-3.5 opacity-70" /> : <HashIcon className="size-3.5 opacity-70" />}
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('announce.mode')}</Label>
              <div className="flex gap-2">
                <ModeButton value="text" label={t('announce.modeText')} hint="/send_message" />
                <ModeButton value="embed" label={t('announce.modeEmbed')} hint="/send_embed" />
              </div>
            </div>

            {isEmbed && (
              <div className="flex flex-col gap-1.5">
                <Label>{t('announce.headline')}</Label>
                <Input value={title} onChange={e => edit(setTitle)(e.target.value)} maxLength={LIMITS.title} />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <Label>{t('announce.message')}</Label>
                <span className={cn('text-xs tabular-nums', overLong ? 'text-destructive' : 'text-muted-foreground')}>
                  {body.length} / {max}
                </span>
              </div>
              <Textarea rows={9} value={body} onChange={e => edit(setBody)(e.target.value)} />
              <p className="text-muted-foreground text-xs">{t('announce.markdownHint')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t('announce.ping')}</Label>
                <Select value={ping} onValueChange={edit(setPing)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('announce.pingNone')}</SelectItem>
                    <SelectItem value="everyone">@everyone</SelectItem>
                    <SelectItem value="here">@here</SelectItem>
                    <SelectItem value="role">{t('announce.pingRole')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ping === 'role' && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t('announce.role')}</Label>
                  <Select value={roleId} onValueChange={edit(setRoleId)}>
                    <SelectTrigger><SelectValue placeholder={t('announce.pickRole')} /></SelectTrigger>
                    <SelectContent>
                      {(lookups?.roles ?? []).map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {isEmbed && (
              <div className="border-border rounded-md border">
                <button
                  type="button"
                  onClick={() => setMore(!more)}
                  className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium"
                >
                  {more ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                  {t('announce.moreFields')}
                </button>
                {more && (
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t('announce.color')}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5865F2'}
                          onChange={e => edit(setColor)(e.target.value)}
                          className="border-border h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                        />
                        <Button variant="ghost" size="sm" onClick={() => edit(setColor)('')} disabled={!color}>
                          {t('announce.colorReset')}
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t('announce.thumbnail')}</Label>
                      <Input value={thumbnail} onChange={e => edit(setThumbnail)(e.target.value)} placeholder={t('announce.brandDefault')} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t('announce.image')}</Label>
                      <Input value={image} onChange={e => edit(setImage)(e.target.value)} placeholder="https://…" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t('announce.footer')}</Label>
                      <Input value={footer} onChange={e => edit(setFooter)(e.target.value)} />
                      <p className="text-muted-foreground text-xs">{t('announce.footerHint')}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {loud && (
              <div className="text-warn border-warn/30 bg-warn/10 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{t('announce.loudWarning')}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={post}
                disabled={!ready || posting || busy}
                variant={confirming ? 'destructive' : 'default'}
              >
                <SendIcon />
                {posting
                  ? t('announce.posting')
                  : confirming
                    ? t('announce.confirm', { channel: channel?.name ?? '' })
                    : t('announce.post')}
              </Button>
              {confirming && (
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('announce.previewTitle')}</CardTitle>
            <CardDescription>{t('announce.previewHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 border-border space-y-2 rounded-lg border p-4">
              <div className="text-muted-foreground text-xs">
                {channel ? `#${channel.name}` : t('announce.pickChannel')}
              </div>

              {ping !== 'none' && (
                <div className="text-primary text-sm font-medium">
                  {ping === 'role' ? `@${role?.name ?? '…'}` : `@${ping}`}
                </div>
              )}

              {isEmbed ? (
                <div
                  className="bg-card rounded-md border-l-4 px-3 py-2.5"
                  style={{ borderLeftColor: barColor(color) }}
                >
                  {title && <div className="text-sm font-semibold">{title}</div>}
                  <div className="mt-1 text-sm break-words whitespace-pre-wrap">
                    {body || <span className="text-muted-foreground">{t('announce.previewEmpty')}</span>}
                  </div>
                  {image && <div className="text-muted-foreground mt-2 text-xs italic">{t('announce.previewImage')}</div>}
                  {footer && <div className="text-muted-foreground mt-2 text-[11px]">{footer}</div>}
                </div>
              ) : (
                <div className="text-sm break-words whitespace-pre-wrap">
                  {body || <span className="text-muted-foreground">{t('announce.previewEmpty')}</span>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('announce.templatesTitle')}</CardTitle>
            <CardDescription>{t('announce.templatesHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t('announce.templateName')}</Label>
                <Input
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder={t('announce.templateNamePlaceholder')}
                  maxLength={100}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  <Label className="cursor-pointer" htmlFor="tpl-shared">{t('announce.templateShared')}</Label>
                  <p className="text-muted-foreground mt-0.5 text-xs">{t('announce.templateSharedHint')}</p>
                </div>
                <Switch id="tpl-shared" checked={templateShared} onCheckedChange={setTemplateShared} />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline" size="sm"
                  onClick={() => saveTemplate('')}
                  disabled={busy || !templateName.trim() || !body.trim()}
                >
                  <BookmarkIcon /> {t('announce.saveAsNew')}
                </Button>
                {selected?.canEdit && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => saveTemplate(selected.id)}
                    disabled={busy || !templateName.trim() || !body.trim()}
                  >
                    <SaveIcon /> {t('announce.overwrite')}
                  </Button>
                )}
              </div>
            </div>

            <div className="border-border space-y-1 border-t pt-3">
              {templates.length === 0 && (
                <p className="text-muted-foreground text-sm">{t('announce.noTemplates')}</p>
              )}
              {templates.map(tpl => (
                <div key={tpl.id} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                  <button
                    type="button"
                    onClick={() => applyTemplate(tpl.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <div className="truncate text-sm font-medium">{tpl.name}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {tpl.mode === 'text' ? t('announce.modeText') : t('announce.modeEmbed')}
                      {!tpl.mine && tpl.owner?.name ? ' \u00b7 ' + tpl.owner.name : ''}
                    </div>
                  </button>
                  <Badge variant={tpl.shared ? 'success' : 'muted'}>
                    {tpl.shared ? t('announce.badgeShared') : t('announce.badgePrivate')}
                  </Badge>
                  {tpl.canEdit && (
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => removeTemplate(tpl.id)}
                      disabled={busy}
                      aria-label={t('common.remove')}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
