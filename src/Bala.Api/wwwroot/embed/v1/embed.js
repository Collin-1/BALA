(() => {
  const resolveEmbedScript = () =>
    document.currentScript ||
    Array.from(document.scripts)
      .reverse()
      .find(
        (script) =>
          script.src &&
          (script.src.endsWith("/embed/v1/embed.js") ||
            script.src.includes("/embed/v1/embed.js")),
      );

  const resolveDefaultApiBase = (script) => {
    if (script?.src) {
      try {
        return new URL(script.src, window.location.href).origin;
      } catch {
        return window.location.origin;
      }
    }

    return window.location.origin;
  };

  const script = resolveEmbedScript();
  const apiBase = resolveDefaultApiBase(script);
  const baseUrl = script?.src
    ? new URL("./", script.src).href
    : `${window.location.origin}/embed/v1/`;

  import(new URL("BalaReader.js", baseUrl).href)
    .then((module) => {
      module.registerBalaReader({ defaultApiBase: apiBase });
    })
    .catch((error) => {
      console.error("[Bala] failed to load embed modules", error);
    });
})();
