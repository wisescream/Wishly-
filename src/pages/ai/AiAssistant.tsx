import React, { useState } from 'react';
import { Send, Bot, Crown, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UpgradeDialog } from '@/components/shared/UpgradeDialog';
import { useAuth } from '@/contexts/AuthContext';
import { sendAiMessage } from '@/lib/api';
import { FREE_LIMITS } from '@/types/database';
import type { AiMessage } from '@/types/database';
import { toast } from 'sonner';

export default function AiAssistant() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hi! I can help brainstorm gift ideas, compare product features, and narrow your search. I don't have live retailer or inventory access, so use product search to check current listings and prices.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyMessagesUsed, setDailyMessagesUsed] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const chips = [
    'Gift ideas for someone who loves hiking',
    'Compare e-readers for travel',
    'Thoughtful housewarming gift ideas',
    'Help me narrow down a desk lamp',
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;

    if (!profile?.is_premium && dailyMessagesUsed >= FREE_LIMITS.dailyAiMessages) {
      setShowUpgrade(true);
      return;
    }

    const userMsg: AiMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setDailyMessagesUsed((c) => c + 1);

    try {
      // Simulate or call AI assistant
      const res = await sendAiMessage(text, null, messages);
      if (!res?.content) throw new Error('Assistant is unavailable');

      const assistantMsg: AiMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: res.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'The assistant is unavailable right now. You can still search for a product or add one manually.',
        timestamp: new Date(),
      }]);
      toast.error('Could not connect to AI service');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col h-screen pb-16 md:pb-0">
        <Header
          title="AI Shopping Assistant"
          subtitle={profile?.is_premium ? 'Premium' : `${dailyMessagesUsed}/${FREE_LIMITS.dailyAiMessages} daily free messages used`}
          actions={
            !profile?.is_premium && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpgrade(true)}
                className="text-amber-400 gap-1 text-xs font-semibold h-8"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Upgrade</span>
              </Button>
            )
          }
        />

        {/* Chat message scroll area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-2xl mx-auto w-full no-scrollbar">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-1 border border-purple-500/20">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-md space-y-3 ${
                    isUser
                      ? 'bg-gradient-to-r from-violet-600 to-pink-500 text-white rounded-2xl rounded-tr-none px-4 py-2.5 shadow-md'
                      : 'glass-card border border-border/50 text-foreground rounded-2xl rounded-tl-none p-4'
                  }`}
                >
                  <p className="text-xs leading-relaxed whitespace-pre-line">
                    {msg.content}
                  </p>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 items-center text-xs text-muted-foreground p-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Thinking…</span>
            </div>
          )}
        </div>

        {/* Suggestion Chips */}
        <div className="px-4 py-2 border-t border-border/30 bg-card/20 max-w-2xl mx-auto w-full">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {chips.map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(chip)}
                className="text-[11px] whitespace-nowrap px-3 py-1.5 rounded-full glass-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-purple-500/40 transition-all shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-background/90 backdrop-blur-xl border-t border-border/40 max-w-2xl mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for ideas or product comparisons..."
              className="flex-1 h-11 rounded-2xl bg-card/60 text-xs border-border/50"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 w-11 rounded-2xl gradient-primary text-white shrink-0 shadow-md shadow-purple-500/20"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>

        <UpgradeDialog
          feature="unlimited AI messages"
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
        />
      </div>
    </AppShell>
  );
}
