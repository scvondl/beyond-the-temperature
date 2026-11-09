/* Let the surrounding research page expand the map when native fullscreen is unavailable. */
(() => {
  const button = document.getElementById('fullscreen');
  const atlas = document.getElementById('atlas');
  let expandedByHost = false;
  const toggleHost = () => parent.postMessage({ type: 'dep5118:toggle-map-fullscreen' }, location.origin);

  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'dep5118:map-fullscreen-state') return;
    expandedByHost = event.data.expanded === true;
    button.setAttribute('aria-label', expandedByHost ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = expandedByHost ? 'Exit fullscreen' : 'Fullscreen';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expandedByHost) toggleHost();
  });
  document.addEventListener('fullscreenchange', () => {
    button.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });

  // Capture the click so the standalone widget's handler remains unchanged.
  button.addEventListener('click', async event => {
    if (parent === window) return;
    event.stopImmediatePropagation();
    if (expandedByHost) return toggleHost();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await atlas.requestFullscreen();
    } catch {
      toggleHost();
    }
  }, true);
})();
