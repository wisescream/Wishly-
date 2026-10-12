import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AtSign, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { signUpWithEmail, signInWithGoogle, signInWithApple } from '@/lib/api';
import { toast } from 'sonner';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_.]/g, '');
      const { data, error } = await signUpWithEmail(
        email,
        password,
        cleanUsername,
        displayName || cleanUsername
      );

      if (error) {
        if (error.message?.toLowerCase().includes('invalid api key')) {
          toast.error('Invalid Supabase API key. Please check your VITE_SUPABASE_ANON_KEY in Vercel or .env');
        } else {
          toast.error(error.message || 'Error signing up');
        }
      } else {
        toast.success('Account created! Welcome to Wishly.');
        navigate('/onboarding');
      }
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('invalid api key')) {
        toast.error('Invalid Supabase API key. Please check your VITE_SUPABASE_ANON_KEY in Vercel or .env');
      } else {
        toast.error(err.message || 'Error signing up');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:scale-105 transition-transform">
              <span className="text-white font-extrabold text-xl">W</span>
            </div>
            <span className="font-extrabold text-2xl tracking-tight gradient-text">
              Wishly
            </span>
          </Link>
          <h2 className="text-xl font-bold">Create your account</h2>
          <p className="text-xs text-muted-foreground">
            Start curating, tracking, and sharing what you love
          </p>
        </div>

        {/* Registration Card */}
        <Card className="rounded-3xl glass-card border border-border/50 shadow-2xl p-2">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-3.5 pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Username</Label>
                <div className="relative">
                  <AtSign className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="amina_style"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="pl-10 h-10 rounded-xl bg-card/60 text-xs border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Amina Benjelloun"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10 h-10 rounded-xl bg-card/60 text-xs border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="amina@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 h-10 rounded-xl bg-card/60 text-xs border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-10 h-10 rounded-xl bg-card/60 text-xs border-border/50"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl gradient-primary text-white font-semibold text-xs shadow-lg shadow-purple-500/20 mt-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <span>Create Account</span>
                )}
              </Button>
            </CardContent>
          </form>

          {/* Social Logins */}
          <div className="px-6 pb-4 space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="border-t border-border/40 w-full" />
              <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase absolute tracking-wider">
                Or sign up with
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                type="button"
                onClick={() => signInWithGoogle()}
                className="h-10 rounded-xl text-xs font-medium border-border/50 bg-card/40 hover:bg-card/80"
              >
                <span>Google</span>
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => signInWithApple()}
                className="h-10 rounded-xl text-xs font-medium border-border/50 bg-card/40 hover:bg-card/80"
              >
                <span>Apple</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Footer Link */}
        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
