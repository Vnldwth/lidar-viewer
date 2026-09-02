/* ===================================================================
   LiDAR Capture Viewer — Gallery Page Logic
   =================================================================== */

(function () {
    'use strict';

    var galleryEl      = document.getElementById('gallery-grid');
    var searchInput    = document.getElementById('gallery-search');
    var tagBar         = document.getElementById('gallery-tags');
    var emptyEl        = document.getElementById('gallery-empty');
    var authPromptEl   = document.getElementById('auth-prompt');
    var loadingEl      = document.getElementById('gallery-loading');

    var currentUser    = null;
    var activeTag      = null;
    var allCaptures    = [];
    var allTags        = [];

    /* ---------------------------------------------------------------
       Init
       --------------------------------------------------------------- */

    async function init() {
        currentUser = await initNavAuth();
        await loadCaptures();

        if (searchInput) {
            searchInput.addEventListener('input', debounce(function () {
                loadCaptures();
            }, 300));
        }

        // Show auth prompt if not logged in
        if (authPromptEl && (!currentUser || !currentUser.authenticated)) {
            authPromptEl.style.display = 'block';
        }
    }

    /* ---------------------------------------------------------------
       Data loading
       --------------------------------------------------------------- */

    async function loadCaptures() {
        showLoading(true);
        try {
            var params = {};
            if (searchInput && searchInput.value.trim()) {
                params.search = searchInput.value.trim();
            }
            if (activeTag) {
                params.tag = activeTag;
            }
            var result = await API.getCaptures(params);
            allCaptures = Array.isArray(result) ? result : (result.captures || result.items || []);
            collectTags(allCaptures);
            renderTags();
            renderGallery();
        } catch (err) {
            showToast('Failed to load captures: ' + err.message, 'error');
            allCaptures = [];
            renderGallery();
        }
        showLoading(false);
    }

    function collectTags(captures) {
        var tagSet = {};
        captures.forEach(function (c) {
            if (c.tags && Array.isArray(c.tags)) {
                c.tags.forEach(function (t) { tagSet[t] = true; });
            }
        });
        allTags = Object.keys(tagSet).sort();
    }

    /* ---------------------------------------------------------------
       Rendering
       --------------------------------------------------------------- */

    function renderGallery() {
        if (!galleryEl) return;

        if (allCaptures.length === 0) {
            galleryEl.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        var html = '';
        allCaptures.forEach(function (cap, idx) {
            var delay = Math.min(idx, 8);
            html += '<a href="/viewer/' + escapeHtml(cap.id) + '" class="capture-card fade-in-up fade-in-up-delay-' + delay + '">';

            // Thumbnail
            if (cap.thumbnail_url) {
                html += '<img class="capture-card-thumb" src="' + escapeHtml(cap.thumbnail_url) + '" alt="" loading="lazy">';
            } else {
                html += '<div class="capture-card-thumb-placeholder"></div>';
            }

            html += '<div class="capture-card-body">';

            // Title
            html += '<div class="capture-card-title">' + escapeHtml(cap.title || 'Untitled Capture') + '</div>';

            // Location
            if (cap.location_name) {
                html += '<div class="capture-card-location">' + escapeHtml(cap.location_name) + '</div>';
            } else {
                html += '<div class="capture-card-location" style="color:var(--text-dim)">No location</div>';
            }

            // Meta row
            html += '<div class="capture-card-meta">';
            if (cap.point_count != null) {
                html += '<span class="capture-card-meta-item">' + formatPoints(cap.point_count) + ' pts</span>';
            }
            if (cap.capture_date || cap.created_at) {
                html += '<span class="capture-card-meta-item">' + formatDate(cap.capture_date || cap.created_at) + '</span>';
            }
            html += '</div>';

            html += '</div>'; // body

            // Footer: tags + visibility badge
            html += '<div class="capture-card-footer">';

            // Tags
            html += '<div class="capture-card-tags">';
            if (cap.tags && cap.tags.length > 0) {
                var shown = cap.tags.slice(0, 3);
                shown.forEach(function (t) {
                    html += '<span class="tag">' + escapeHtml(t) + '</span>';
                });
                if (cap.tags.length > 3) {
                    html += '<span class="tag tag-muted">+' + (cap.tags.length - 3) + '</span>';
                }
            }
            html += '</div>';

            // Visibility
            if (cap.visibility && cap.visibility !== 'public') {
                var vclass = 'badge-' + cap.visibility;
                var vlabel = cap.visibility === 'authenticated' ? '🔒 Auth' : '🛡️ Private';
                html += '<span class="badge ' + vclass + '">' + vlabel + '</span>';
            }

            html += '</div>'; // footer
            html += '</a>';
        });

        galleryEl.innerHTML = html;
    }

    function renderTags() {
        if (!tagBar) return;
        if (allTags.length === 0) {
            tagBar.innerHTML = '';
            return;
        }

        var html = '<span class="tag tag-clickable' + (activeTag === null ? ' active' : '') + '" data-tag="">All</span>';
        allTags.forEach(function (t) {
            var cls = 'tag tag-clickable' + (activeTag === t ? ' active' : '');
            html += '<span class="' + cls + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>';
        });
        tagBar.innerHTML = html;

        // Click handlers
        tagBar.querySelectorAll('.tag-clickable').forEach(function (el) {
            el.addEventListener('click', function () {
                var t = this.getAttribute('data-tag');
                activeTag = t || null;
                loadCaptures();
            });
        });
    }

    /* ---------------------------------------------------------------
       Helpers
       --------------------------------------------------------------- */

    function showLoading(show) {
        if (!loadingEl) return;
        loadingEl.style.display = show ? 'flex' : 'none';
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
