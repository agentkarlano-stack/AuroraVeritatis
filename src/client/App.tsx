import { useEffect, type ReactNode } from "react";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/auth";
import { HqPrefsProvider } from "./lib/prefs";
import { matchPath, RouterProvider, useRouter } from "./lib/router";
import { Account } from "./pages/Account";
import { CountryIndex, CountryProfile } from "./pages/Countries";
import { Headquarters } from "./pages/Headquarters";
import { Home } from "./pages/Home";
import { NotFound, Plans, Roadmap } from "./pages/Info";
import { Markets } from "./pages/Markets";
import { QuantLab } from "./pages/QuantLab";
import { Radar } from "./pages/Radar";

interface Route {
  pattern: string;
  title: string;
  render: (params: Record<string, string>) => ReactNode;
}

const ROUTES: Route[] = [
  { pattern: "/", title: "Global Analysis & Strategic Insight", render: () => <Home /> },
  { pattern: "/hq", title: "Headquarters", render: () => <Headquarters /> },
  { pattern: "/radar", title: "Global Radar", render: () => <Radar /> },
  { pattern: "/countries", title: "Country Intelligence", render: () => <CountryIndex /> },
  { pattern: "/countries/:iso3", title: "Country Profile", render: (p) => <CountryProfile iso3={p.iso3!} /> },
  { pattern: "/markets", title: "Markets", render: () => <Markets /> },
  { pattern: "/lab", title: "Quantitative Research Lab", render: () => <QuantLab /> },
  { pattern: "/account", title: "Account", render: () => <Account /> },
  { pattern: "/plans", title: "Plans", render: () => <Plans /> },
  { pattern: "/roadmap", title: "Roadmap & Data Policy", render: () => <Roadmap /> },
];

function Routes() {
  const { path } = useRouter();
  let match: { route: Route; params: Record<string, string> } | null = null;
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, path);
    if (params) {
      match = { route, params };
      break;
    }
  }
  useEffect(() => {
    document.title = `${match ? match.route.title : "Not found"} — Aurora Veritatis`;
  }, [match?.route.title]);
  return <>{match ? match.route.render(match.params) : <NotFound />}</>;
}

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <HqPrefsProvider>
          <Layout>
            <Routes />
          </Layout>
        </HqPrefsProvider>
      </AuthProvider>
    </RouterProvider>
  );
}
