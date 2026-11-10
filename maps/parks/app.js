/* Park Voices — 54-park review vocabulary map.
   Leaflet + local data only. Each park opens a detail panel with its word cloud
   and a pie chart of the ten most frequent words (all remaining terms = Others). */
(() => {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('embed') === '1') document.body.classList.add('embed');

  const CATEGORY_COLORS = {
    A: '#1c5c44', B: '#2f7d5b', C: '#4c9a6d', D: '#79b98c', E: '#a9d3aa'
  };
  const PIE_COLORS = ['#123f2e', '#1d5a40', '#2a7551', '#3a8f62', '#4fa873',
    '#66b884', '#82c795', '#a0d5a7', '#bce2b8', '#d8ecc9'];
  const OTHERS_COLOR = '#c9d3c3';
  const TOP_N = 10;
  const CLOUD_BASE = '../../assets/images/park-wordclouds/';

  const $ = id => document.getElementById(id);
  const fmt = n => Number(n).toLocaleString('en-SG');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const state = {
    map: null,
    parksGeo: null,
    reviews: {},
    category: 'all',
    selectedId: null,
    layer: null,
    selectedLayer: null,
    marker: null
  };

  /* ------------------------------------------------------------------ map */

  function initMap() {
    state.map = L.map('map', {
      center: [1.3521, 103.8198],
      zoom: 11,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    state.map.attributionControl.setPrefix('');
    state.map.attributionControl.addAttribution(
      'Boundaries: OSM / NParks · Planning areas: URA');

    /* Keep the planning-area basemap in its own pane below the park polygons.
       Both files load asynchronously; without a fixed pane, whichever finishes
       last is drawn on top and can hide the parks. */
    state.map.createPane('basemap');
    const basemapPane = state.map.getPane('basemap');
    basemapPane.style.zIndex = '350';
    basemapPane.style.pointerEvents = 'none';
  }

  async function drawBasemap() {
    try {
      const response = await fetch('data/planning-areas.geojson');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      L.geoJSON(data, {
        pane: 'basemap',
        interactive: false,
        style: {
          color: '#d7e0d0', weight: 1, fillColor: '#f7f8f2', fillOpacity: 1
        }
      }).addTo(state.map);
    } catch (error) {
      console.warn('Planning-area basemap unavailable:', error);
    }
  }

  /* --------------------------------------------------------------- layers */

  function categoryOf(feature) {
    return feature.properties.code || 'A';
  }

  function baseStyle(feature) {
    const color = CATEGORY_COLORS[categoryOf(feature)] || '#4c9a6d';
    return {
      color: '#ffffff', weight: 1, opacity: 0.9,
      fillColor: color, fillOpacity: 0.72
    };
  }

  function selectedStyle(feature) {
    return Object.assign(baseStyle(feature), {
      color: '#d8e66e', weight: 2.6, opacity: 1, fillOpacity: 0.95
    });
  }

  function dimStyle(feature) {
    const color = CATEGORY_COLORS[categoryOf(feature)] || '#4c9a6d';
    return { color: '#eef2e8', weight: 0.5, opacity: 0.5, fillColor: color, fillOpacity: 0.06 };
  }

  function renderParks() {
    if (state.layer) {
      state.map.removeLayer(state.layer);
      state.layer = null;
    }
    if (state.marker) {
      state.map.removeLayer(state.marker);
      state.marker = null;
    }

    const selected = state.selectedId;
    state.layer = L.geoJSON(state.parksGeo, {
      filter: feature => feature.properties.geometry_kind === 'polygon',
      style: feature => {
        if (state.category !== 'all' && categoryOf(feature) !== state.category) return dimStyle(feature);
        return feature.properties.id === selected ? selectedStyle(feature) : baseStyle(feature);
      },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(esc(feature.properties.name), {
          className: 'park-tooltip', direction: 'top', sticky: true, opacity: 1
        });
        layer.on('click', () => openPark(feature.properties.id, layer));
        layer.on('mouseover', () => {
          if (feature.properties.id !== state.selectedId) layer.setStyle({ weight: 2.2, color: '#ffffff' });
        });
        layer.on('mouseout', () => {
          if (feature.properties.id !== state.selectedId) state.layer.resetStyle(layer);
        });
        if (feature.properties.id === selected) state.selectedLayer = layer;
      }
    }).addTo(state.map);

    /* P51 Marina City Park has no boundary left; mark its former location. */
    const point = state.parksGeo.features.find(f => f.properties.geometry_kind === 'point');
    if (point) {
      const [lon, lat] = point.geometry.coordinates;
      state.marker = L.circleMarker([lat, lon], {
        radius: 7, color: '#ffffff', weight: 1.6,
        fillColor: CATEGORY_COLORS[point.properties.code] || '#a9d3aa', fillOpacity: 0.95
      }).addTo(state.map);
      state.marker.bindTooltip(esc(point.properties.name) + ' · point only', {
        className: 'park-tooltip', direction: 'top', opacity: 1
      });
      state.marker.on('click', () => openPark(point.properties.id, null));
    }
  }

  function applyFilter() {
    if (!state.layer) return;
    state.layer.setStyle(feature => {
      const matches = state.category === 'all' || categoryOf(feature) === state.category;
      if (!matches) return dimStyle(feature);
      return feature.properties.id === state.selectedId ? selectedStyle(feature) : baseStyle(feature);
    });
  }

  /* -------------------------------------------------------------- filters */

  function buildCategoryButtons() {
    const names = {
      A: 'A · Waterfront', B: 'B · Coastal', C: 'C · Hill / Woodland',
      D: 'D · Community', E: 'E · Urban core'
    };
    const codes = [...new Set(state.parksGeo.features
      .filter(f => f.properties.geometry_kind === 'polygon')
      .map(f => f.properties.code))].sort();

    const buttons = [`<button class="filter-button active" type="button" data-code="all">All</button>`]
      .concat(codes.map(code => `<button class="filter-button" type="button" data-code="${esc(code)}">
        <span class="swatch" style="background:${CATEGORY_COLORS[code] || '#4c9a6d'}"></span>${esc(names[code] || code)}
      </button>`));

    $('category-buttons').innerHTML = buttons.join('');
    $('category-buttons').addEventListener('click', event => {
      const button = event.target.closest('.filter-button');
      if (!button) return;
      state.category = button.dataset.code;
      [...$('category-buttons').children].forEach(item => item.classList.toggle('active', item === button));
      applyFilter();
    });
  }

  function buildLegend() {
    const names = {
      A: 'Waterfront / Reservoir', B: 'Coastal', C: 'Hill / Woodland',
      D: 'Open Community / Town Park', E: 'Urban Core / Compact Park'
    };
    const codes = [...new Set(state.parksGeo.features
      .filter(f => f.properties.geometry_kind === 'polygon')
      .map(f => f.properties.code))].sort();
    $('legend-items').innerHTML = codes.map(code => `<div class="legend-item">
      <span class="legend-swatch" style="background:${CATEGORY_COLORS[code] || '#4c9a6d'}"></span>
      <span>${esc(names[code] || code)}</span></div>`).join('');
  }

  function buildParkSelect() {
    const parks = state.parksGeo.features
      .map(f => f.properties)
      .sort((a, b) => a.id.localeCompare(b.id));
    $('park-select').innerHTML = '<option value="">Choose a park…</option>' +
      parks.map(p => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)}</option>`).join('');
    $('park-select').addEventListener('change', event => {
      const id = event.target.value;
      if (!id) return;
      const feature = state.parksGeo.features.find(f => f.properties.id === id);
      if (feature && state.category !== 'all' && feature.properties.code !== state.category) {
        state.category = 'all';
        [...$('category-buttons').children].forEach(item =>
          item.classList.toggle('active', item.dataset.code === 'all'));
        applyFilter();
      }
      selectPark(id);
    });
  }

  /* --------------------------------------------------------------- detail */

  function slicesFor(park) {
    const ranked = (park.keywords || [])
      .filter(k => k && k.word && Number.isFinite(Number(k.count)))
      .map(k => ({ word: k.word, count: Number(k.count) }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    if (!ranked.length) return null;
    const total = ranked.reduce((sum, k) => sum + k.count, 0);
    const slices = ranked.slice(0, TOP_N).map((k, i) => ({
      label: k.word, count: k.count, color: PIE_COLORS[i % PIE_COLORS.length], others: false
    }));
    const rest = ranked.slice(TOP_N);
    const others = rest.reduce((sum, k) => sum + k.count, 0);
    if (others > 0) {
      slices.push({
        label: 'Others', count: others, color: OTHERS_COLOR, others: true,
        detail: `${rest.length} more terms`
      });
    }
    return { slices, total, terms: ranked.length };
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function polar(cx, cy, r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }

  function drawPie(svg, legend, chart) {
    const cx = 150, cy = 150, r = 116;
    svg.innerHTML = '';
    legend.innerHTML = '';
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = 'Share of counted mentions per word';
    svg.appendChild(title);

    let angle = -Math.PI / 2;
    const rows = [];
    chart.slices.forEach((slice, index) => {
      const share = slice.count / chart.total;
      const end = angle + share * Math.PI * 2;
      const [x0, y0] = polar(cx, cy, r, angle);
      const [x1, y1] = polar(cx, cy, r, end);
      const large = end - angle > Math.PI ? 1 : 0;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d',
        `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`);
      path.setAttribute('fill', slice.color);
      path.setAttribute('class', 'pie-slice');
      path.setAttribute('data-index', String(index));
      path.setAttribute('aria-label',
        `${slice.label}: ${fmt(slice.count)} (${(share * 100).toFixed(1)}%)`);
      svg.appendChild(path);

      const row = document.createElement('li');
      row.className = slice.others ? 'is-others' : '';
      row.dataset.index = String(index);
      row.innerHTML =
        `<span class="pie-swatch" style="background:${slice.color}"></span>` +
        `<span class="pie-word" title="${esc(slice.label)}">${esc(slice.label)}</span>` +
        `<span class="pie-count">${fmt(slice.count)}<small>${(share * 100).toFixed(1)}%</small></span>`;
      legend.appendChild(row);
      rows.push({ path, row });
      angle = end;
    });

    const activate = index => rows.forEach((item, i) => {
      item.path.classList.toggle('is-active', i === index);
      item.path.classList.toggle('is-dim', index !== null && i !== index);
      item.row.classList.toggle('is-active', i === index);
    });
    rows.forEach((item, i) => {
      item.path.addEventListener('mouseenter', () => activate(i));
      item.path.addEventListener('mouseleave', () => activate(null));
      item.row.addEventListener('mouseenter', () => activate(i));
      item.row.addEventListener('mouseleave', () => activate(null));
    });
  }

  function openPark(id, layer) {
    const feature = state.parksGeo.features.find(f => f.properties.id === id);
    if (!feature) return;
    const props = feature.properties;
    const park = state.reviews[id] || { name: props.name, category: props.category, reviews: 0, textReviews: 0, keywords: [] };

    state.selectedId = id;
    state.selectedLayer = layer || null;
    applyFilter();
    $('park-select').value = id;

    $('detail-id').textContent = id;
    $('detail-name').textContent = props.name;
    $('detail-cat').textContent = `${props.code || ''} · ${props.category || park.category || ''}`.replace(/^·\s*/, '');
    $('detail-stats').textContent = park.reviews
      ? `${fmt(park.reviews)} collected reviews · ${fmt(park.textReviews)} with text`
      : 'No collected reviews for this park';

    const chart = slicesFor(park);
    const hasCloud = park.textReviews > 0 && id !== 'P51';

    $('detail-cloud').hidden = !hasCloud;
    if (hasCloud) {
      const img = $('detail-cloud-img');
      img.src = `${CLOUD_BASE}${id}.png`;
      img.alt = `Word cloud of ${props.name} reviews`;
      img.onerror = () => { $('detail-cloud').hidden = true; };
    }

    $('detail-chart').hidden = !chart;
    $('detail-empty').hidden = !!chart;
    if (chart) {
      $('detail-total').textContent = `${chart.terms} ranked terms`;
      drawPie($('detail-pie'), $('detail-legend'), chart);
      $('detail-note').innerHTML = `Top 10 words, with every remaining term summed as <b>Others</b>. ` +
        `Shares use all ${fmt(chart.total)} counted mentions, so the slices total 100%.`;
    }

    $('detail').hidden = false;
    zoomTo(feature, layer);
  }

  function closeDetail() {
    $('detail').hidden = true;
    state.selectedId = null;
    applyFilter();
  }

  function zoomTo(feature, layer) {
    const narrow = window.matchMedia('(max-width: 820px)').matches;
    const paddingTopLeft = narrow ? [16, 96] : [330, 70];
    const paddingBottomRight = narrow
      ? [16, Math.round(state.map.getSize().y * 0.48)]
      : [415, 70];
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      state.map.setView([lat, lon], 15, { animate: true });
      return;
    }
    const bounds = layer ? layer.getBounds() : L.geoJSON(feature).getBounds();
    state.map.fitBounds(bounds, {
      paddingTopLeft, paddingBottomRight, maxZoom: 15, animate: true
    });
  }

  function selectPark(id) {
    const feature = state.parksGeo.features.find(f => f.properties.id === id);
    if (!feature) return;
    let target = null;
    if (state.layer) {
      state.layer.eachLayer(item => {
        if (item.feature && item.feature.properties.id === id) target = item;
      });
    }
    state.selectedLayer = target;
    openPark(id, target);
    $('park-select').value = id;
  }

  /* ---------------------------------------------------------------- boot */

  function showStatus(message) {
    const box = $('map-status');
    box.textContent = message;
    box.style.display = 'block';
  }

  async function boot() {
    initMap();
    drawBasemap();

    try {
      const [geo, reviews] = await Promise.all([
        fetch('data/parks.geojson').then(r => { if (!r.ok) throw new Error('parks HTTP ' + r.status); return r.json(); }),
        fetch('data/park_reviews.json').then(r => { if (!r.ok) throw new Error('reviews HTTP ' + r.status); return r.json(); })
      ]);
      state.parksGeo = geo;
      state.reviews = Object.fromEntries((reviews.parks || []).map(p => [p.id, p]));

      renderParks();
      buildCategoryButtons();
      buildLegend();
      buildParkSelect();

      const bounds = L.geoJSON(geo).getBounds();
      state.map.fitBounds(bounds, { padding: [20, 20] });

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'parks-atlas:ready', count: geo.features.length }, '*');
      }
    } catch (error) {
      console.error(error);
      showStatus('Park data could not be loaded. Open the site through START_WINDOWS.bat ' +
        '(or any local web server) rather than by double-clicking the HTML file.');
    }

    $('detail-close').addEventListener('click', closeDetail);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('detail').hidden) closeDetail();
    });
    $('reset-view').addEventListener('click', () => {
      state.map.fitBounds(L.geoJSON(state.parksGeo).getBounds(), { padding: [24, 24] });
    });

    /* Fullscreen for standalone use; inside the site, embed-host.js takes over. */
    $('fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('atlas').requestFullscreen();
      } catch {
        showStatus('Fullscreen is disabled by the host page.');
      }
    });
    document.addEventListener('fullscreenchange', () => setTimeout(() => state.map.invalidateSize(), 120));
    window.addEventListener('message', event => {
      if (event.data && event.data.type === 'dep5118:map-fullscreen-state') {
        setTimeout(() => state.map.invalidateSize(), 140);
      }
    });
    window.addEventListener('resize', () => state.map.invalidateSize());

    /* A lazy iframe can initialise before it has its final height; re-measure
       whenever the container changes size so the map is never left blank. */
    if (window.ResizeObserver) {
      let pending = 0;
      const observer = new ResizeObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          state.map.invalidateSize();
        });
      });
      observer.observe(document.getElementById('map'));
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
