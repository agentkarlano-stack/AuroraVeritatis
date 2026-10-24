import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { PrefsSync } from './auth/PrefsSync';
import { EntitlementsSync } from './auth/EntitlementsSync';
import { SessionGuard } from './auth/SessionGuard';
import { IntroSplash } from './components/IntroSplash';
import { Layout } from './components/Layout';
import { AppLoading } from './components/ui';
import Home from './pages/Home';

const Headquarters = lazy(() => import('./pages/Headquarters'));
const Radar = lazy(() => import('./pages/Radar'));
const Countries = lazy(() => import('./pages/Countries'));
const CountryDossier = lazy(() => import('./pages/CountryDossier'));
const Compare = lazy(() => import('./pages/Compare'));
const CountriesVs = lazy(() => import('./pages/CountriesVs'));
const Markets = lazy(() => import('./pages/Markets'));
const Lab = lazy(() => import('./pages/Lab'));
const Impact = lazy(() => import('./pages/Impact'));
const Strategy = lazy(() => import('./pages/Strategy'));
const Tension = lazy(() => import('./pages/Tension'));
const Positioning = lazy(() => import('./pages/Positioning'));
const Macro = lazy(() => import('./pages/Macro'));
const Currency = lazy(() => import('./pages/Currency'));
const Briefing = lazy(() => import('./pages/Briefing'));
const GeoExplorer = lazy(() => import('./pages/GeoExplorer'));
const Newsletter = lazy(() => import('./pages/Newsletter'));
const Commodities = lazy(() => import('./pages/Commodities'));
const Forecasts = lazy(() => import('./pages/Forecasts'));
const Business = lazy(() => import('./pages/Business'));
const Brain = lazy(() => import('./pages/Brain'));
const Share = lazy(() => import('./pages/Share'));
const ShareCard = lazy(() => import('./pages/ShareCard'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminQuote = lazy(() => import('./pages/AdminQuote'));
const Status = lazy(() => import('./pages/Status'));
const About = lazy(() => import('./pages/About'));
const News = lazy(() => import('./pages/News'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Legal = lazy(() => import('./pages/Legal'));
const NotFound = lazy(() => import('./pages/NotFound'));

export function App() {
  return (
    <AuthProvider>
      <PrefsSync />
      <EntitlementsSync />
      <SessionGuard />
      <IntroSplash />
      <BrowserRouter>
        <Routes>
          <Route path="share/card" element={<Lazy><ShareCard /></Lazy>} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="hq" element={<Lazy><Headquarters /></Lazy>} />
            <Route path="radar" element={<Lazy><Radar /></Lazy>} />
            <Route path="briefing" element={<Lazy><Briefing /></Lazy>} />
            <Route path="geo" element={<Lazy><GeoExplorer /></Lazy>} />
            <Route path="newsletter" element={<Lazy><Newsletter /></Lazy>} />
            <Route path="business" element={<Lazy><Business /></Lazy>} />
            <Route path="countries" element={<Lazy><Countries /></Lazy>} />
            <Route path="countries/compare" element={<Lazy><Compare /></Lazy>} />
            <Route path="countries/vs" element={<Lazy><CountriesVs /></Lazy>} />
            <Route path="countries/:iso3" element={<Lazy><CountryDossier /></Lazy>} />
            <Route path="markets" element={<Lazy><Markets /></Lazy>} />
            <Route path="markets/commodities" element={<Lazy><Commodities /></Lazy>} />
            <Route path="lab/forecasts" element={<Lazy><Forecasts /></Lazy>} />
            <Route path="lab" element={<Lazy><Lab /></Lazy>} />
            <Route path="impact" element={<Lazy><Impact /></Lazy>} />
            <Route path="strategy" element={<Lazy><Strategy /></Lazy>} />
            <Route path="tension" element={<Lazy><Tension /></Lazy>} />
            <Route path="positioning" element={<Lazy><Positioning /></Lazy>} />
            <Route path="macro" element={<Lazy><Macro /></Lazy>} />
            <Route path="currency" element={<Lazy><Currency /></Lazy>} />
            <Route path="brain" element={<Lazy><Brain /></Lazy>} />
            <Route path="share" element={<Lazy><Share /></Lazy>} />
            <Route path="pricing" element={<Lazy><Pricing /></Lazy>} />
            <Route path="signin" element={<Lazy><SignIn /></Lazy>} />
            <Route path="account" element={<Lazy><Account /></Lazy>} />
            <Route path="admin" element={<Lazy><Admin /></Lazy>} />
            <Route path="admin/quote" element={<Lazy><AdminQuote /></Lazy>} />
            <Route path="status" element={<Lazy><Status /></Lazy>} />
            <Route path="about" element={<Lazy><About /></Lazy>} />
            <Route path="news" element={<Lazy><News /></Lazy>} />
            <Route path="assistant" element={<Lazy><Assistant /></Lazy>} />
            <Route path="legal/:doc" element={<Lazy><Legal /></Lazy>} />
            <Route path="*" element={<Lazy><NotFound /></Lazy>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AppLoading />}>{children}</Suspense>;
}
