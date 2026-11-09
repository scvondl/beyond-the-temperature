(() => {
  const cases = {
    east: {
      lst: '35.1°C', vbs: '47.6', count: '1,471',
      words: 'cycling · sea · family · walk',
      interpretation: 'Visitors frequently mention activities and coastal features. These words do not show whether they felt hot or comfortable.'
    },
    bukit: {
      lst: '33.9°C', vbs: '90.7', count: '612',
      words: 'beautiful · walk · quarry · peaceful',
      interpretation: 'Reviews often mention walking, scenery and the quarry. These topics are not direct measurements of thermal sensation.'
    }
  };
  const buttons = [...document.querySelectorAll('[data-case]')];
  const fields = {
    lst: document.getElementById('case-lst'),
    vbs: document.getElementById('case-vbs'),
    count: document.getElementById('case-count'),
    words: document.getElementById('case-words'),
    interpretation: document.getElementById('case-interpretation')
  };
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const selected = button.dataset.case;
      const data = cases[selected];
      if (!data) return;
      buttons.forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      Object.entries(fields).forEach(([name, node]) => {
        if (node && data[name]) node.textContent = data[name];
      });
    });
  });

  // Highlight the chapter currently in the viewport. Navigation also works without JS.
  const links = [...document.querySelectorAll('[data-story-step]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const chapters = links.map(link => document.getElementById(link.dataset.storyStep)).filter(Boolean);
  const seen = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
    const visible = [...seen].filter(([, ratio]) => ratio > 0).sort((a,b) => b[1] - a[1]);
    if (!visible.length) return;
    for (const link of links) {
      if (link.dataset.storyStep === visible[0][0]) link.setAttribute('aria-current','step');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-18% 0px -48% 0px', threshold:[0,0.01,0.1,0.3,0.55] });
  for (const item of chapters) observer.observe(item);
})();
