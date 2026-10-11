import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  DollarSign,
  Moon,
  Sun,
  Laptop,
  Bell,
  Shield,
  LogOut,
  Trash2,
  Crown,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { CURRENCIES, type Currency } from '@/lib/currency';
import { signOut, deleteAccount } from '@/lib/api';
import { toast } from 'sonner';

export default function Settings() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();

  const handleLogout = async () => {
    await signOut();
    toast.success('Logged out successfully');
    navigate('/auth/login');
  };

  const handleDelete = async () => {
    if (confirm(t.settings.deleteAccountConfirm)) {
      if (profile) await deleteAccount(profile.id);
      toast.success('Account deleted');
      navigate('/auth/login');
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24">
        <Header showBack title={t.settings.title} />

        <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-6">
          {/* Preferences Section */}
          <Card className="rounded-3xl glass-card border border-border/50 p-2">
            <CardContent className="space-y-4 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t.settings.preferences}
              </h3>

              {/* Language Selector */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">{t.settings.language}</Label>
                  <p className="text-[11px] text-muted-foreground">App interface language</p>
                </div>
                <Select value={lang} onValueChange={(val) => setLang(val as Language)}>
                  <SelectTrigger className="w-32 h-9 rounded-xl text-xs bg-card/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code} className="text-xs">
                        {l.flag} {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Currency Selector */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">{t.settings.currency}</Label>
                  <p className="text-[11px] text-muted-foreground">Default price display</p>
                </div>
                <Select value={currency} onValueChange={(val) => setCurrency(val as Currency)}>
                  <SelectTrigger className="w-32 h-9 rounded-xl text-xs bg-card/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CURRENCIES).map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-xs">
                        {c.flag} {c.code} ({c.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Theme Selector */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">{t.settings.theme}</Label>
                  <p className="text-[11px] text-muted-foreground">Appearance mode</p>
                </div>
                <div className="flex items-center gap-1 bg-card/60 border border-border/50 rounded-xl p-0.5">
                  <Button
                    variant={theme === 'light' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('light')}
                    className="w-7 h-7 rounded-lg"
                  >
                    <Sun className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('dark')}
                    className="w-7 h-7 rounded-lg"
                  >
                    <Moon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={theme === 'system' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setTheme('system')}
                    className="w-7 h-7 rounded-lg"
                  >
                    <Laptop className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications Toggles */}
          <Card className="rounded-3xl glass-card border border-border/50 p-2">
            <CardContent className="space-y-4 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t.settings.notificationSettings}
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">{t.settings.priceDrop}</Label>
                  <p className="text-[11px] text-muted-foreground">When items hit target price</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">{t.settings.friendActivity}</Label>
                  <p className="text-[11px] text-muted-foreground">New lists and gift reservations</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">{t.settings.occasionReminders}</Label>
                  <p className="text-[11px] text-muted-foreground">Birthdays and event countdowns</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full h-11 rounded-2xl border-border/50 text-xs font-semibold gap-2 hover:bg-card/80"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
              <span>{t.common.logOut}</span>
            </Button>

            <Button
              variant="ghost"
              onClick={handleDelete}
              className="w-full h-10 rounded-2xl text-destructive hover:bg-destructive/10 text-xs font-semibold gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.settings.deleteAccount}</span>
            </Button>
          </div>

          <div className="text-center text-[11px] text-muted-foreground pt-4">
            <p>Wishly v1.0.0 (PWA)</p>
            <p className="text-[10px] opacity-75 mt-0.5">Designed with React + Vite + Tailwind + Supabase</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
