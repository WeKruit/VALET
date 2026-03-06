const PROTOCOL_TIMEOUT_MS = 2000;

/**
 * Attempts to launch a custom protocol URL (e.g. ghosthands://handoff/{token}).
 * If the page doesn't lose visibility within 2 seconds, assumes the app is not
 * installed and redirects to the download page with the handoff token preserved.
 */
export function launchProtocolOrFallback(deepLink: string, handoffToken: string) {
  let launched = false;

  function onBlur() {
    launched = true;
  }

  window.addEventListener("blur", onBlur);

  // Attempt protocol launch via hidden iframe (avoids navigation-away on failure)
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = deepLink;
  document.body.appendChild(iframe);

  setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    document.body.removeChild(iframe);

    if (!launched && !document.hidden) {
      // App not installed — redirect to download page with token
      window.location.href = `/download?handoff=${encodeURIComponent(handoffToken)}`;
    }
  }, PROTOCOL_TIMEOUT_MS);
}
