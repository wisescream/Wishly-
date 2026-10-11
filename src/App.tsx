import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { I18nProvider } from '@/contexts/I18nContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { Loader2 } from 'lucide-react';

// Lazy loading all pages
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const AuthCallback = lazy(() => import('@/pages/auth/AuthCallback'));
const Onboarding = lazy(() => import('@/pages/onboarding/Onboarding'));
const Home = lazy(() => import('@/pages/home/Home'));
const MyWishlists = lazy(() => import('@/pages/wishlists/MyWishlists'));
const WishlistDetail = lazy(() => import('@/pages/wishlists/WishlistDetail'));
const CreateWishlist = lazy(() => import('@/pages/wishlists/CreateWishlist'));
const EditWishlist = lazy(() => import('@/pages/wishlists/EditWishlist'));
const AddItem = lazy(() => import('@/pages/items/AddItem'));
const ItemDetail = lazy(() => import('@/pages/items/ItemDetail'));
const Discover = lazy(() => import('@/pages/discover/Discover'));
const AiAssistant = lazy(() => import('@/pages/ai/AiAssistant'));
const Friends = lazy(() => import('@/pages/friends/Friends'));
const FriendProfile = lazy(() => import('@/pages/friends/FriendProfile'));
const Notifications = lazy(() => import('@/pages/notifications/Notifications'));
const Profile = lazy(() => import('@/pages/profile/Profile'));
const Settings = lazy(() => import('@/pages/settings/Settings'));
const Premium = lazy(() => import('@/pages/premium/Premium'));
const PublicWishlist = lazy(() => import('@/pages/public/PublicWishlist'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 mins
    },
  },
});

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

// Protected route guard: redirects to login if not authenticated
function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingFallback />;
  if (!session) return <Navigate to="/auth/login" replace />;

  return <Outlet />;
}

// Public or guest route: if already authenticated, root redirects to /home
function RootRoute() {
  const { session, loading } = useAuth();

  if (loading) return <LoadingFallback />;
  if (session) return <Navigate to="/home" replace />;

  return <Landing />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <I18nProvider>
            <CurrencyProvider>
              <BrowserRouter>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    {/* Public Landing & Auth */}
                    <Route path="/" element={<RootRoute />} />
                    <Route path="/auth/login" element={<Login />} />
                    <Route path="/auth/register" element={<Register />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    {/* Standalone Public Wishlist (no auth required) */}
                    <Route path="/u/:username/:slug" element={<PublicWishlist />} />

                    {/* Protected Authenticated Routes */}
                    <Route element={<ProtectedRoute />}>
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route path="/home" element={<Home />} />
                      <Route path="/wishlists" element={<MyWishlists />} />
                      <Route path="/wishlists/new" element={<CreateWishlist />} />
                      <Route path="/wishlists/:id" element={<WishlistDetail />} />
                      <Route path="/wishlists/:id/edit" element={<EditWishlist />} />
                      <Route path="/items/add" element={<AddItem />} />
                      <Route path="/items/:id" element={<ItemDetail />} />
                      <Route path="/discover" element={<Discover />} />
                      <Route path="/ai" element={<AiAssistant />} />
                      <Route path="/friends" element={<Friends />} />
                      <Route path="/friends/:username" element={<FriendProfile />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/premium" element={<Premium />} />
                    </Route>

                    {/* Catch all redirect */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
              <Toaster />
            </CurrencyProvider>
          </I18nProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
