import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { signInWithEmail, signInWithGoogle, signInWithApple } from '@/lib/api';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await signInWithEmail(email, password);
      if (error) {
        toast.error(error.message || 'Invalid credentials');
      } else {
        toast.success('Welcome back!');
        navigate('/home');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error signing in');
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
          <h2 className="text-xl font-bold">Welcome back</h2>
          <p className="text-xs text-muted-foreground">
            Sign in to access your wishlists and price alerts
          </p>
        </div>

        {/* Card Form */}
        <Card className="rounded-3xl glass-card border border-border/50 shadow-2xl p-2">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-4">
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
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold">Password</Label>
                  <a href="#" className="text-[11px] text-primary hover:underline">
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
                  <span>Sign In</span>
                )}
              </Button>
            </CardContent>
          </form>

          {/* Social Logins */}
          <div className="px-6 pb-4 space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="border-t border-border/40 w-full" />
              <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase absolute tracking-wider">
                Or continue with
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
          Don't have an account?{' '}
          <Link to="/auth/register" className="text-primary font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
