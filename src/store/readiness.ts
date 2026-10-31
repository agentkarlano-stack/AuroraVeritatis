import { create } from 'zustand';

/** Set once the first lazily loaded page has rendered (see `RouteReady` in App.tsx). */
export const useReadiness = create<{ routeReady: boolean }>()(() => ({ routeReady: false }));
export const markRouteReady = () => {
  if (!useReadiness.getState().routeReady) useReadiness.setState({ routeReady: true });
};
