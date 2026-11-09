(() => {
  const frames = [...document.querySelectorAll('.atlas-frame')];
  let expandedFrame = null;

  function setExpanded(frame, expanded) {
    if (expandedFrame && expandedFrame !== frame) setExpanded(expandedFrame, false);
    frame.closest('.map-embed').classList.toggle('is-expanded', expanded);
    expandedFrame = expanded ? frame : null;
    document.body.classList.toggle('map-is-expanded', expanded);
    frame.contentWindow.postMessage({ type: 'dep5118:map-fullscreen-state', expanded }, location.origin);
    if (!expanded) frame.focus({ preventScroll: true });
  }

  frames.forEach(frame => {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'map-close';
    close.textContent = 'Close expanded map ×';
    close.addEventListener('click', () => setExpanded(frame, false));
    frame.closest('.map-embed').querySelector('.embed-bar').append(close);
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'dep5118:toggle-map-fullscreen') return;
    const frame = frames.find(item => item.contentWindow === event.source);
    if (frame) setExpanded(frame, expandedFrame !== frame);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expandedFrame) setExpanded(expandedFrame, false);
  });
})();
