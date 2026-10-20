import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import Home from './pages/Home';

const Headquarters = lazy(() => import('./pages/Headquarters'));
const Radar = lazy(() => import('./pages/Radar'));
const Countries = lazy(() => import('./pages/Countries'));
const CountryDossier = lazy(() => import('./pages/CountryDossier'));
const Markets = lazy(() => import('./pages/Markets'));
const Lab = lazy(() => import('./pages/Lab'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Account = lazy(() => import('./pages/Account'));
const Status = lazy(() => import('./pages/Status'));
const Legal = lazy(() => import('./pages/Legal'));
const NotFound = lazy(() => import('./pages/NotFound'));

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="hq" element={<Lazy><Headquarters /></Lazy>} />
            <Route path="radar" element={<Lazy><Radar /></Lazy>} />
            <Route path="countries" element={<Lazy><Countries /></Lazy>} />
            <Route path="countries/:iso3" element={<Lazy><CountryDossier /></Lazy>} />
            <Route path="markets" element={<Lazy><Markets /></Lazy>} />
            <Route path="lab" element={<Lazy><Lab /></Lazy>} />
            <Route path="pricing" element={<Lazy><Pricing /></Lazy>} />
            <Route path="signin" element={<Lazy><SignIn /></Lazy>} />
            <Route path="account" element={<Lazy><Account /></Lazy>} />
            <Route path="status" element={<Lazy><Status /></Lazy>} />
            <Route path="legal/:doc" element={<Lazy><Legal /></Lazy>} />
            <Route path="*" element={<Lazy><NotFound /></Lazy>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="mx-auto max-w-7xl px-4"><Loading /></div>}>{children}</Suspense>;
}
