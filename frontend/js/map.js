/* ===================================================================
   LiDAR Capture Viewer — Map Page Logic
   =================================================================== */

(function () {
    'use strict';

    var mapEl     = document.getElementById('map-container');
    var emptyEl   = document.getElementById('map-empty');
    var legendCt  = document.getElementById('map-legend-count');

    var map       = null;
    var markers   = null;

    /* ---------------------------------------------------------------
       Init
       --------------------------------------------------------------- */

    async function init() {
        await initNavAuth();
        initMap();
        await loadCaptures();
    }

    /* ---------------------------------------------------------------
       Map setup
       --------------------------------------------------------------- */

    function initMap() {
        map = L.map(mapEl, {
            center: [37.7749, -122.4194],
            zoom: 5,
            zoomControl: true
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);

        markers = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            iconCreateFunction: function (cluster) {
                var count = cluster.getChildCount();
                var size = count < 10 ? 'small' : (count < 50 ? 'medium' : 'large');
                return L.divIcon({
                    html: '<div>' + count + '</div>',
                    className: 'marker-cluster marker-cluster-' + size,
                    iconSize: L.point(40, 40)
                });
            }
        });

        map.addLayer(markers);
    }

    /* ---------------------------------------------------------------
       Data loading
       --------------------------------------------------------------- */

    async function loadCaptures() {
        try {
            var result = await API.getCaptures();
            var captures = Array.isArray(result) ? result : (result.captures || result.items || []);
            renderMarkers(captures);
        } catch (err) {
            showToast('Failed to load captures: ' + err.message, 'error');
        }
    }

    /* ---------------------------------------------------------------
       Render markers
       --------------------------------------------------------------- */

    function renderMarkers(captures) {
        var geoCaptures = captures.filter(function (c) {
            return c.latitude != null && c.longitude != null &&
                   !isNaN(c.latitude) && !isNaN(c.longitude);
        });

        if (geoCaptures.length === 0) {
            legendCt.textContent = '0 locations';
            emptyEl.style.display = 'flex';
            return;
        }

        emptyEl.style.display = 'none';
        legendCt.textContent = geoCaptures.length + ' location' + (geoCaptures.length !== 1 ? 's' : '');

        var markerIcon = L.divIcon({
            html: '<div style="' +
                'width:14px;height:14px;' +
                'background:#00d4ff;' +
                'border-radius:50%;' +
                'border:2px solid rgba(255,255,255,0.9);' +
                'box-shadow:0 0 10px rgba(0,212,255,0.5), 0 2px 6px rgba(0,0,0,0.4);' +
                '"></div>',
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -10]
        });

        geoCaptures.forEach(function (cap) {
            var marker = L.marker([cap.latitude, cap.longitude], { icon: markerIcon });

            var popupHtml = '<div class="map-popup">';

            // Thumbnail
            if (cap.thumbnail_url) {
                popupHtml += '<img class="map-popup-thumb" src="' + escapeHtml(cap.thumbnail_url) + '" alt="">';
            }

            popupHtml += '<div class="map-popup-body">';
            popupHtml += '<div class="map-popup-title">' + escapeHtml(cap.title || 'Untitled') + '</div>';

            if (cap.location_name) {
                popupHtml += '<div class="map-popup-location">' + escapeHtml(cap.location_name) + '</div>';
            }

            var metaParts = [];
            if (cap.point_count != null) {
                metaParts.push(formatPoints(cap.point_count) + ' points');
            }
            if (cap.capture_date || cap.created_at) {
                metaParts.push(formatDate(cap.capture_date || cap.created_at));
            }
            if (metaParts.length > 0) {
                popupHtml += '<div class="map-popup-meta">' + metaParts.join(' &middot; ') + '</div>';
            }

            popupHtml += '<a href="/viewer/' + escapeHtml(cap.id) + '" class="map-popup-link">';
            popupHtml += 'View Capture &#x2192;';
            popupHtml += '</a>';
            popupHtml += '</div>'; // body
            popupHtml += '</div>'; // popup

            marker.bindPopup(popupHtml, {
                maxWidth: 300,
                minWidth: 280,
                closeButton: true
            });

            markers.addLayer(marker);
        });

        // Fit map to show all markers
        var bounds = markers.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        }
    }

    /* ---------------------------------------------------------------
       Boot
       --------------------------------------------------------------- */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
