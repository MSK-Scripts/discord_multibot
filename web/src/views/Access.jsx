import { useCallback, useEffect, useState } from 'react';
import { InfoIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { api } from '../api.js';
import { Banner, Empty, SectionTitle, fmtDate } from '../ui.jsx';
import { useI18n } from '../i18n.jsx';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select.jsx';

const EMPTY_FORM = { subjectType: 'role', subjectId: '', permissions: [], active: true, label: '' };

/**
 * Who may use the dashboard, and for what.
 *
 * THE RULE THAT MATTERS: a USER entry OVERRIDES that person's role entries
 * completely rather than adding to them. That is what makes it possible to take
 * a single permission AWAY from one staff member that their role grants. The
 * server enforces the same rule; this screen only explains it.
 */
export default function Access() {
  const { t, tOr, tn } = useI18n();
  const [data, setData] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);

  const load = useCallback(() => {
    api.access().then(setData).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api.guild().then(setLookups).catch(() => {});
  }, [load]);

  const roleName = (id) => lookups?.roles?.find(r => r.id === id)?.name ?? null;
  // The server ships an English label per permission. Translating it is
  // optional per key, so a permission added tomorrow reads in English rather
  // than as a raw key.
  const permLabel = (p) => tOr(`permissions.${p}`, data?.labels?.[p]?.en ?? p);

  const toggle = (perm) => setForm(f => ({
    ...f,
    permissions: f.permissions.includes(perm)
      ? f.permissions.filter(p => p !== perm)
      : [...f.permissions, perm],
  }));

  const submit = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveAccess(form);
      setNotice(t('common.saved'));
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (entry) => setForm({
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    permissions: [...entry.permissions],
    active: entry.active,
    label: entry.label ?? '',
  });

  // An inline confirm rather than window.confirm(): a browser that suppresses
  // dialogs makes confirm() return false, and the click then silently does
  // nothing at all.
  const remove = async (entry) => {
    const key = `${entry.subjectType}:${entry.subjectId}`;
    if (confirmKey !== key) { setConfirmKey(key); return; }
    setConfirmKey(null);
    setError(null);
    try {
      await api.deleteAccess(entry.subjectType, entry.subjectId);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data) return <Empty>{t('common.loading')}</Empty>;

  return (
    <div className="space-y-4">
      <SectionTitle>{t('access.title')}</SectionTitle>

      <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>

      <Alert>
        <InfoIcon />
        <AlertDescription>
          {t('access.overrideNotice')}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{form.subjectId ? t('access.editTitle') : t('access.grantTitle')}</CardTitle>
          <CardDescription>{t('access.grantHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('access.type')}</Label>
              <Select
                value={form.subjectType}
                onValueChange={v => setForm(f => ({ ...f, subjectType: v, subjectId: '' }))}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">{t('access.role')}</SelectItem>
                  <SelectItem value="user">{t('access.user')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
              <Label>{form.subjectType === 'role' ? t('access.role') : t('access.userId')}</Label>
              {form.subjectType === 'role' && lookups?.roles?.length ? (
                <Select value={form.subjectId} onValueChange={v => setForm(f => ({ ...f, subjectId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('access.pickRole')} /></SelectTrigger>
                  <SelectContent>
                    {lookups.roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.subjectId}
                  onChange={e => setForm(f => ({ ...f, subjectId: e.target.value.trim() }))}
                  placeholder={t('access.idPlaceholder')}
                  className="font-mono"
                />
              )}
            </div>

            <div className="flex min-w-[10rem] flex-col gap-1.5">
              <Label>{t('access.note')}</Label>
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder={t('access.optional')}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              {t('access.active')}
            </label>
          </div>

          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.permissions.map(p => (
              <label key={p} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="truncate">{permLabel(p)}</span>
                <Switch checked={form.permissions.includes(p)} onCheckedChange={() => toggle(p)} />
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy || !form.subjectId}>
              {form.subjectId && data.rows.some(r => r.subjectId === form.subjectId && r.subjectType === form.subjectType)
                ? t('access.update')
                : t('access.grant')}
            </Button>
            {form.subjectId && (
              <Button variant="ghost" onClick={() => setForm(EMPTY_FORM)}>{t('common.cancel')}</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('access.listTitle')}</CardTitle>
          <CardDescription>{tn('access.listCount', data.rows.length)}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <Empty>{t('access.empty')}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('access.colSubject')}</TableHead>
                    <TableHead>{t('access.colPermissions')}</TableHead>
                    <TableHead>{t('access.colChanged')}</TableHead>
                    <TableHead className="text-right">{t('access.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map(entry => {
                    const key = `${entry.subjectType}:${entry.subjectId}`;
                    return (
                      <TableRow key={key} className={cn(!entry.active && 'opacity-50')}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="muted" className="uppercase">{t(`access.${entry.subjectType}`)}</Badge>
                            <span className="font-medium">
                              {entry.subjectType === 'role'
                                ? (roleName(entry.subjectId) ?? entry.subjectId)
                                : (entry.user?.name ?? entry.subjectId)}
                            </span>
                            {!entry.active && <Badge variant="muted">{t('access.inactive')}</Badge>}
                          </div>
                          {entry.label && <div className="text-muted-foreground text-xs">{entry.label}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {entry.permissions.length === 0
                              ? <span className="text-muted-foreground text-xs">{t('common.none')}</span>
                              : entry.permissions.map(p => (
                                <Badge key={p} variant="outline" className="text-[10px]">{permLabel(p)}</Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmtDate(entry.updatedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => edit(entry)}>
                              <PencilIcon /> {t('common.edit')}
                            </Button>
                            <Button
                              variant={confirmKey === key ? 'destructive' : 'ghost'}
                              size="sm"
                              onClick={() => remove(entry)}
                            >
                              <Trash2Icon /> {confirmKey === key ? t('common.confirm') : t('common.remove')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
