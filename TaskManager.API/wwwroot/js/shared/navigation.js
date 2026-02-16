export const toPageUrl = (pageName, query) => {
  const url = new URL(pageName, window.location.href);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return `${url.pathname}${url.search}`;
};

export const navigateToSpacesPage = () => {
  window.location.href = toPageUrl("index.html");
};

export const navigateToWorkspacePage = (workspaceId) => {
  window.location.href = toPageUrl("workspace.html", { workspaceId });
};
