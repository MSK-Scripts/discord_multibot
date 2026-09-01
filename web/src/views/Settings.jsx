import { useEffect, useRef, useState } from 'react';
import { UploadIcon, RotateCcwIcon } from 'lucide-react';
import { api } from '../api.js';
import { Banner, SectionTitle } from '../ui.jsx';
import { applyAccent, applyFavicon, hexToRgb } from '../settings.js';
import { useI18n } from '../i18n.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';

/** The built-in accent from index.css. What the picker shows when nothing is set. */
const DEFAULT_ACCENT = '#5eb131';

/**
 * The dashboard's own appearance: accent colour and favicon.
 *
 * Gated by settings.view to read and settings.edit to change; the owner holds
 * both. Somebody with only settings.view sees the current look with every
 * control disabled. The API enforces the same split, so this only avoids
 * offering a button that would come back 403.
 */
export default function Settings({ me }) {
  const canEdit = me.isOwner || me.permissions.includes('settings.edit');
  const { t } = useI18n();

  const [loaded, setLoaded] = useState(false);
  const [accent, setAccentInput] = useState(DEFAULT_ACCENT);
  const [savedAccent, setSavedAccent] = useState(null); // null = the default is in use
  const [faviconVersion, setFaviconVersion] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.settings()
      .then(s => {
        setSavedAccent(s.accent);
        setAccentInput(s.accent || DEFAULT_ACCENT);
        setFaviconVersion(s.faviconVersion);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const validHex = Boolean(hexToRgb(accent));
  const accentDirty = validHex && accent.toLowerCase() !== (savedAccent || DEFAULT_ACCENT).toLowerCase();

  // Live preview: applied while picking, so the whole panel shows the colour
  // straight away. Saving persists it; leaving without saving reverts on reload.
  const preview = (hex) => { setAccentInput(hex); if (hexToRgb(hex)) applyAccent(hex); };

  const saveAccent = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveSettings(accent);
      applyAccent(accent);
      setSavedAccent(accent.toLowerCase());
      setNotice(t('settings.accentSaved'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const resetAccent = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.saveSettings(null);
      applyAccent(null); // back to the stylesheet default
      setSavedAccent(null);
      setAccentInput(DEFAULT_ACCENT);
      setNotice(t('settings.accentReset'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const uploadFavicon = async () => {
    if (!file) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { version } = await api.uploadFavicon(file);
      setFaviconVersion(version);
      applyFavicon(version);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setNotice(t('settings.faviconUpdated'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const resetFavicon = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.clearFavicon();
      setFaviconVersion(null);
      applyFavicon(null);
      setNotice(t('settings.faviconReset'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!loaded) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <SectionTitle>{t('settings.title')}</SectionTitle>

      <Banner type="error" onClose={() => setError(null)}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice(null)}>{notice}</Banner>
      {!canEdit && <Banner type="info">{t('common.readOnly')}</Banner>}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.accentTitle')}</CardTitle>
          <CardDescription>
            {t('settings.accentHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t('settings.colour')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={validHex ? accent : DEFAULT_ACCENT}
                  onChange={e => preview(e.target.value)}
                  disabled={!canEdit}
                  className="border-border size-9 cursor-pointer rounded-md border bg-transparent"
                  aria-label={t('settings.accentTitle')}
                />
                <Input
                  value={accent}
                  onChange={e => preview(e.target.value)}
                  disabled={!canEdit}
                  className="w-36 font-mono"
                />
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2 pb-0.5">
                <Button onClick={saveAccent} disabled={busy || !accentDirty}>{t('common.save')}</Button>
                <Button variant="outline" onClick={resetAccent} disabled={busy || !savedAccent}>
                  <RotateCcwIcon /> {t('common.reset')}
                </Button>
              </div>
            )}
          </div>
          {!validHex && <p className="text-destructive text-xs">{t('settings.notAHex')}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.faviconTitle')}</CardTitle>
          <CardDescription>
            {t('settings.faviconHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {faviconVersion
              ? <img src={`/favicon.ico?v=${faviconVersion}`} alt="" className="size-8 rounded" />
              : <div className="bg-muted size-8 rounded" />}
            <span className="text-muted-foreground text-sm">
              {faviconVersion ? t('settings.faviconCustom') : t('settings.faviconDefault')}
            </span>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/x-icon,.ico"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="text-muted-foreground text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
              />
              <Button onClick={uploadFavicon} disabled={busy || !file}><UploadIcon /> {t('common.upload')}</Button>
              <Button variant="outline" onClick={resetFavicon} disabled={busy || !faviconVersion}>
                <RotateCcwIcon /> {t('common.reset')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
