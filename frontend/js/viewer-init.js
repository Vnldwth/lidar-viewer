/* ===================================================================
   LiDAR Capture Viewer — Viewer Page Initialization
   =================================================================== */

/**
 * Initialize the Potree viewer and all surrounding UI for a given capture.
 * Called from the inline script at the bottom of viewer.html.
 */
async function initViewer(captureId) {
    'use strict';

    var titleEl      = document.getElementById('viewer-title');
    var loadingEl    = document.getElementById('viewer-loading');
    var loadingSubEl = document.getElementById('viewer-loading-sub');
    var infoPanel    = document.getElementById('info-panel');
    var btnInfo      = document.getElementById('btn-info');
    var btnShare     = document.getElementById('btn-share');
    var btnSidebar   = document.getElementById('btn-sidebar');
    var mapInset     = document.getElementById('map-inset');
    var mapContainer = document.getElementById('map-inset-container');
    var mapToggle    = document.getElementById('map-inset-toggle');

    var capture = null;
    var infoPanelOpen = false;
    var mapCollapsed = false;
    var potreeSidebarVisible = false;

    /* ---------------------------------------------------------------
       1. Fetch capture metadata
       --------------------------------------------------------------- */

    try {
        loadingSubEl.textContent = 'Fetching capture metadata...';
        capture = await API.getCapture(captureId);
    } catch (err) {
        loadingSubEl.textContent = 'Error: ' + err.message;
        showToast('Failed to load capture: ' + err.message, 'error');
        return;
    }

    // Update page title
    var displayTitle = capture.title || 'Untitled Capture';
    titleEl.textContent = displayTitle;
    document.title = displayTitle + ' - LiDAR Capture';

    /* ---------------------------------------------------------------
       2. Initialize Potree
       --------------------------------------------------------------- */

    loadingSubEl.textContent = 'Initializing 3D viewer...';

    var viewer = new Potree.Viewer(document.getElementById('potree_render_area'));
    viewer.setEDLEnabled(true);
    viewer.setFOV(60);
    viewer.setPointBudget(3000000);
    viewer.setBackground('gradient');
    viewer.setDescription('');

    // Hide Potree's built-in sidebar by default
    var sidebarEl = document.getElementById('potree_sidebar_container');
    if (sidebarEl) {
        sidebarEl.style.display = 'none';
    }

    /* ---------------------------------------------------------------
       3. Load point cloud
       --------------------------------------------------------------- */

    loadingSubEl.textContent = 'Loading point cloud data...';

    var potreeUrl = '/api/captures/' + encodeURIComponent(captureId) + '/potree/metadata.json';

    Potree.loadPointCloud(potreeUrl, displayTitle, function (e) {
        viewer.scene.addPointCloud(e.pointcloud);

        // Configure material
        var material = e.pointcloud.material;
        material.activeAttributeName = 'elevation';
        material.size = 1;
        material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
        material.shape = Potree.PointShape.CIRCLE;

        // Fit camera to point cloud
        viewer.fitToScreen();

        // Hide loading overlay
        setTimeout(function () {
            loadingEl.classList.add('hidden');
        }, 500);
    }, function (err) {
        loadingSubEl.textContent = 'Failed to load point cloud';
        showToast('Point cloud load error', 'error');
    });

    /* ---------------------------------------------------------------
       4. Populate info panel
       --------------------------------------------------------------- */

    var detailsEl = document.getElementById('info-details');
    var rows = [];

    if (capture.sensor_model) {
        rows.push({ label: 'Sensor', value: escapeHtml(capture.sensor_model) });
    }
    if (capture.capture_date) {
        rows.push({ label: 'Captured', value: formatDate(capture.capture_date) });
    }
    if (capture.created_at) {
        rows.push({ label: 'Uploaded', value: formatDate(capture.created_at) });
    }
    if (capture.location_name) {
        rows.push({ label: 'Location', value: escapeHtml(capture.location_name) });
    }
    if (capture.latitude != null && capture.longitude != null) {
        rows.push({
            label: 'Coordinates',
            value: Number(capture.latitude).toFixed(5) + ', ' + Number(capture.longitude).toFixed(5)
        });
    }
    if (capture.point_count != null) {
        rows.push({ label: 'Points', value: formatPoints(capture.point_count) + ' points' });
    }
    if (capture.file_size != null) {
        rows.push({ label: 'File Size', value: formatSize(capture.file_size) });
    }
    if (capture.visibility) {
        var visLabels = { public: '👁️ Public', authenticated: '🔒 Authenticated', private: '🛡️ Private' };
        rows.push({ label: 'Visibility', value: visLabels[capture.visibility] || capture.visibility });
    }
    if (capture.status) {
        rows.push({ label: 'Status', value: capture.status.charAt(0).toUpperCase() + capture.status.slice(1) });
    }

    var detailsHtml = '';
    rows.forEach(function (r) {
        detailsHtml += '<div class="viewer-info-row">';
        detailsHtml += '<span class="label">' + r.label + '</span>';
        detailsHtml += '<span class="value">' + r.value + '</span>';
        detailsHtml += '</div>';
    });
    detailsEl.innerHTML = detailsHtml;

    // Description
    if (capture.description) {
        document.getElementById('info-desc-section').style.display = 'block';
        document.getElementById('info-description').textContent = capture.description;
    }

    // Tags
    if (capture.tags && capture.tags.length > 0) {
        document.getElementById('info-tags-section').style.display = 'block';
        var tagsHtml = '';
        capture.tags.forEach(function (t) {
            tagsHtml += '<span class="tag">' + escapeHtml(t) + '</span>';
        });
        document.getElementById('info-tags').innerHTML = tagsHtml;
    }

    /* ---------------------------------------------------------------
       5. Map inset
       --------------------------------------------------------------- */

    if (capture.latitude != null && capture.longitude != null) {
        mapInset.style.display = 'block';

        var map = L.map(mapContainer, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false
        }).setView([capture.latitude, capture.longitude], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(map);

        var markerIcon = L.divIcon({
            html: '<div style="width:12px;height:12px;background:var(--accent,#00d4ff);border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px rgba(0,212,255,0.6);"></div>',
            className: '',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        L.marker([capture.latitude, capture.longitude], { icon: markerIcon }).addTo(map);

        // Collapse / expand
        mapToggle.addEventListener('click', function () {
            mapCollapsed = !mapCollapsed;
            if (mapCollapsed) {
                mapInset.classList.add('collapsed');
                mapToggle.innerHTML = '&#x1F5FA;';
            } else {
                mapInset.classList.remove('collapsed');
                mapToggle.innerHTML = '&#x2715;';
                setTimeout(function () { map.invalidateSize(); }, 300);
            }
        });
    }

    /* ---------------------------------------------------------------
       6. Button handlers
       --------------------------------------------------------------- */

    // Info panel toggle
    btnInfo.addEventListener('click', function () {
        infoPanelOpen = !infoPanelOpen;
        if (infoPanelOpen) {
            infoPanel.classList.add('open');
        } else {
            infoPanel.classList.remove('open');
        }
    });

    // Share (copy URL)
    btnShare.addEventListener('click', function () {
        var url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
                showToast('Link copied to clipboard', 'success');
            }).catch(function () {
                fallbackCopy(url);
            });
        } else {
            fallbackCopy(url);
        }
    });

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('Link copied to clipboard', 'success');
        } catch (_) {
            showToast('Copy failed', 'error');
        }
        document.body.removeChild(ta);
    }

    // Potree sidebar toggle
    btnSidebar.addEventListener('click', function () {
        potreeSidebarVisible = !potreeSidebarVisible;
        if (sidebarEl) {
            sidebarEl.style.display = potreeSidebarVisible ? '' : 'none';
        }
        // Also toggle Potree's internal sidebar state if available
        if (viewer.toggleSidebar) {
            viewer.toggleSidebar();
        }
    });
}
