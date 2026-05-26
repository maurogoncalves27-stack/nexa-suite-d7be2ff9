const NON_RESTORABLE_PREFIXES = ["/auth", "/reset-password", "/verificar", "/fornecedor"];

export const LAST_APP_ROUTE_STORAGE_KEY = "rhplus:last-app-route";

export function isRestorableAppRoute(pathname: string) {
  if (!pathname || pathname === "/") return false;

  return !NON_RESTORABLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function buildRouteSnapshot(pathname: string, search = "", hash = "") {
  return `${pathname}${search}${hash}`;
}

export function isRestorableRouteSnapshot(route: string | null | undefined) {
  if (!route) return false;
  const pathname = route.split(/[?#]/)[0] || "/";
  return isRestorableAppRoute(pathname);
}

export function saveLastAppRoute(route: string) {
  try {
    localStorage.setItem(LAST_APP_ROUTE_STORAGE_KEY, route);
  } catch {
    // noop
  }
}

export function readLastAppRoute() {
  try {
    return localStorage.getItem(LAST_APP_ROUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}