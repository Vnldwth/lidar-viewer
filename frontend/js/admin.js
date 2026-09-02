/* ===================================================================
   LiDAR Capture Viewer — Admin Panel Logic
   =================================================================== */

(function () {
    'use strict';

    var statsGrid       = document.getElementById('stats-grid');
    var capturesTbody   = document.getElementById('captures-tbody');
    var capturesLoading = document.getElementById('captures-loading');
    var capturesTable   = document.getElementById('captures-table-wrap');
    var capturesEmpty   = document.getElementById('captures-empty');
    var usersTbody      = document.getElementById('users-tbody');
    var usersTable      = document.getElementById('users-table-wrap');
    var dropzone        = document.getElementById('upload-dropzone');
    var fileInput       = document.getElementById('upload-file');
    var fileInfoEl      = document.getElementById('upload-file-info');
    var fileNameEl      = document.getElementById('upload-file-name');
    var fileSizeEl      = document.getElementById('upload-file-size');

    var adminCaptures   = [];
    var deleteTargetId  = null;

    /* ---------------------------------------------------------------
       Init
       --------------------------------------------------------------- */

    async function init() {
        var user = await initNavAuth();

        // Redirect non-admins
        if (!user || !user.authenticated || !user.is_admin) {
            showToast('Admin access required', 'error');
            setTimeout(function () {
                window.location = '/';
            }, 1500);
            return;
        }

        await Promise.all([
            loadStats(),
            loadAdminCaptures(),
            loadUsers()
        ]);

        setupDropzone();
        setupVisibilityToggle();
    }

    /* ---------------------------------------------------------------
       Dashboard Stats
       --------------------------------------------------------------- */

    async function loadStats() {
        try {
            var stats = await API.getStats();
            renderStats(stats);
        } catch (err) {
            statsGrid.innerHTML = '<p class="text-muted">Failed to load stats</p>';
        }
    }

    function renderStats(stats) {
        var items = [
            { value: stats.total_captures != null ? stats.total_captures : '--', label: 'Total Captures' },
            { value: stats.ready != null ? stats.ready : '--',               label: 'Ready',       accent: true },
            { value: stats.processing != null ? stats.processing : '--',     label: 'Processing' },
            { value: stats.public_count != null ? stats.public_count : '--', label: 'Public' },
            { value: stats.total_points != null ? formatPoints(stats.total_points) : '--', label: 'Total Points' },
            { value: stats.total_size != null ? formatSize(stats.total_size) : '--',       label: 'Storage Used' },
            { value: stats.user_count != null ? stats.user_count : '--',                   label: 'Users' }
        ];

        var html = '';
        items.forEach(function (item) {
            html += '<div class="stat-card">';
            html += '<div class="stat-card-value' + (item.accent ? ' accent' : '') + '">' + item.value + '</div>';
            html += '<div class="stat-card-label">' + item.label + '</div>';
            html += '</div>';
        });
        statsGrid.innerHTML = html;
    }

    /* ---------------------------------------------------------------
       Captures Table
       --------------------------------------------------------------- */

    window.loadAdminCaptures = async function () {
        capturesLoading.style.display = 'flex';
        capturesTable.style.display = 'none';
        capturesEmpty.style.display = 'none';

        try {
            var result = await API.getAdminCaptures();
            adminCaptures = Array.isArray(result) ? result : (result.captures || result.items || []);
            renderCaptures();
        } catch (err) {
            showToast('Failed to load captures: ' + err.message, 'error');
        }

        capturesLoading.style.display = 'none';
    };

    function renderCaptures() {
        if (adminCaptures.length === 0) {
            capturesTable.style.display = 'none';
            capturesEmpty.style.display = 'block';
            return;
        }

        capturesEmpty.style.display = 'none';
        capturesTable.style.display = 'block';

        var html = '';
        adminCaptures.forEach(function (cap) {
            html += '<tr>';

            // Thumbnail
            html += '<td class="thumb-cell">';
            if (cap.thumbnail_url) {
                html += '<img src="' + escapeHtml(cap.thumbnail_url) + '" alt="">';
            } else {
                html += '<div style="width:48px;height:32px;background:var(--bg-deep);border-radius:var(--radius-sm);"></div>';
            }
            html += '</td>';

            // Title
            html += '<td>';
            html += '<a href="/viewer/' + escapeHtml(cap.id) + '" style="color:var(--text);font-weight:500;">';
            html += escapeHtml(cap.title || 'Untitled');
            html += '</a>';
            if (cap.location_name) {
                html += '<br><span class="text-sm text-muted">' + escapeHtml(cap.location_name) + '</span>';
            }
            html += '</td>';

            // Status
            var statusClass = 'badge-' + (cap.status || 'pending');
            html += '<td><span class="badge ' + statusClass + '">' + escapeHtml(cap.status || 'pending') + '</span></td>';

            // Visibility
            var visMap = { public: '👁️ Public', authenticated: '🔒 Auth', private: '🛡️ Private' };
            var visBadge = 'badge-' + (cap.visibility || 'public');
            html += '<td><span class="badge ' + visBadge + '">' + (visMap[cap.visibility] || cap.visibility || 'public') + '</span></td>';

            // Points
            html += '<td class="text-muted">' + (cap.point_count != null ? formatPoints(cap.point_count) : '--') + '</td>';

            // Size
            html += '<td class="text-muted">' + (cap.file_size != null ? formatSize(cap.file_size) : '--') + '</td>';

            // Date
            html += '<td class="text-muted">' + formatDate(cap.capture_date || cap.created_at) + '</td>';

            // Actions
            html += '<td class="actions-cell">';
            html += '<button class="btn btn-sm btn-secondary" onclick="openEditModal(\'' + escapeHtml(cap.id) + '\')">Edit</button>';
            html += '<button class="btn btn-sm btn-secondary" onclick="doReprocess(\'' + escapeHtml(cap.id) + '\')" title="Reprocess">&#x21BB;</button>';
            html += '<button class="btn btn-sm btn-danger" onclick="openDeleteModal(\'' + escapeHtml(cap.id) + '\', \'' + escapeHtml((cap.title || 'Untitled').replace(/'/g, '')) + '\')">Delete</button>';
            html += '</td>';

            html += '</tr>';
        });

        capturesTbody.innerHTML = html;
    }

    /* ---------------------------------------------------------------
       Users Table
       --------------------------------------------------------------- */

    async function loadUsers() {
        try {
            var result = await API.getUsers();
            var users = Array.isArray(result) ? result : (result.users || result.items || []);
            renderUsers(users);
        } catch (_) {
            // Users endpoint might not exist; silently skip
        }
    }

    function renderUsers(users) {
        if (users.length === 0) return;
        usersTable.style.display = 'block';

        var html = '';
        users.forEach(function (u) {
            html += '<tr>';
            html += '<td>' + escapeHtml(u.name || '--') + '</td>';
            html += '<td class="text-muted">' + escapeHtml(u.email || '--') + '</td>';
            html += '<td>' + (u.is_admin ? '<span class="badge badge-ready">Admin</span>' : '<span class="text-dim">No</span>') + '</td>';
            html += '<td class="text-muted text-sm">' + (u.groups && u.groups.length > 0 ? escapeHtml(u.groups.join(', ')) : '--') + '</td>';
            html += '<td class="text-muted">' + formatDate(u.last_login) + '</td>';
            html += '</tr>';
        });
        usersTbody.innerHTML = html;
    }

    /* ---------------------------------------------------------------
       Upload
       --------------------------------------------------------------- */

    window.toggleUploadForm = function () {
        var wrap = document.getElementById('upload-form-wrap');
        wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    };

    function setupDropzone() {
        if (!dropzone) return;

        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                showFileInfo(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) {
                showFileInfo(fileInput.files[0]);
            }
        });
    }

    function showFileInfo(file) {
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatSize(file.size);
        fileInfoEl.style.display = 'block';
    }

    window.doUpload = async function () {
        var file = fileInput.files[0];
        if (!file) {
            showToast('Please select a file', 'warning');
            return;
        }

        var title = document.getElementById('up-title').value.trim();
        if (!title) {
            showToast('Title is required', 'warning');
            return;
        }

        var fd = new FormData();
        fd.append('file', file);
        fd.append('title', title);
        fd.append('visibility', document.getElementById('up-visibility').value);

        var desc = document.getElementById('up-description').value.trim();
        if (desc) fd.append('description', desc);

        var loc = document.getElementById('up-location').value.trim();
        if (loc) fd.append('location_name', loc);

        var sensor = document.getElementById('up-sensor').value.trim();
        if (sensor) fd.append('sensor_model', sensor);

        var lat = document.getElementById('up-lat').value;
        if (lat) fd.append('latitude', lat);

        var lng = document.getElementById('up-lng').value;
        if (lng) fd.append('longitude', lng);

        var captureDate = document.getElementById('up-date').value;
        if (captureDate) fd.append('capture_date', captureDate);

        var tags = document.getElementById('up-tags').value.trim();
        if (tags) {
            var tagList = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
            fd.append('tags', JSON.stringify(tagList));
        }

        // Show progress
        var progressEl  = document.getElementById('upload-progress');
        var progressBar = document.getElementById('upload-progress-bar');
        var progressTxt = document.getElementById('upload-progress-text');
        var btnUpload   = document.getElementById('btn-upload');

        progressEl.classList.add('active');
        btnUpload.disabled = true;
        progressBar.style.width = '0%';
        progressTxt.textContent = 'Uploading...';

        try {
            // Use XMLHttpRequest for progress tracking
            await new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/admin/captures', true);
                xhr.withCredentials = true;

                xhr.upload.addEventListener('progress', function (e) {
                    if (e.lengthComputable) {
                        var pct = Math.round((e.loaded / e.total) * 100);
                        progressBar.style.width = pct + '%';
                        progressTxt.textContent = 'Uploading... ' + pct + '%';
                    }
                });

                xhr.addEventListener('load', function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        var detail;
                        try {
                            detail = JSON.parse(xhr.responseText).detail;
                        } catch (_) {
                            detail = 'Upload failed (' + xhr.status + ')';
                        }
                        reject(new Error(detail));
                    }
                });

                xhr.addEventListener('error', function () {
                    reject(new Error('Network error'));
                });

                xhr.send(fd);
            });

            showToast('Capture uploaded successfully', 'success');
            progressTxt.textContent = 'Complete!';
            progressBar.style.width = '100%';

            // Reset form
            setTimeout(function () {
                toggleUploadForm();
                resetUploadForm();
                loadAdminCaptures();
                loadStats();
            }, 1000);

        } catch (err) {
            showToast('Upload failed: ' + err.message, 'error');
            progressTxt.textContent = 'Failed';
        }

        btnUpload.disabled = false;
    };

    function resetUploadForm() {
        fileInput.value = '';
        fileInfoEl.style.display = 'none';
        document.getElementById('up-title').value = '';
        document.getElementById('up-description').value = '';
        document.getElementById('up-visibility').value = 'public';
        document.getElementById('up-location').value = '';
        document.getElementById('up-sensor').value = 'Ouster OS1-64';
        document.getElementById('up-lat').value = '';
        document.getElementById('up-lng').value = '';
        document.getElementById('up-date').value = '';
        document.getElementById('up-tags').value = '';
        document.getElementById('upload-progress').classList.remove('active');
        document.getElementById('upload-progress-bar').style.width = '0%';
    }

    /* ---------------------------------------------------------------
       Edit Modal
       --------------------------------------------------------------- */

    window.openEditModal = function (captureId) {
        var cap = adminCaptures.find(function (c) { return c.id === captureId; });
        if (!cap) return;

        document.getElementById('edit-id').value = cap.id;
        document.getElementById('edit-title').value = cap.title || '';
        document.getElementById('edit-description').value = cap.description || '';
        document.getElementById('edit-visibility').value = cap.visibility || 'public';
        document.getElementById('edit-sensor').value = cap.sensor_model || '';
        document.getElementById('edit-location').value = cap.location_name || '';
        document.getElementById('edit-lat').value = cap.latitude != null ? cap.latitude : '';
        document.getElementById('edit-lng').value = cap.longitude != null ? cap.longitude : '';
        document.getElementById('edit-tags').value = (cap.tags || []).join(', ');

        // Format date for input
        if (cap.capture_date) {
            var d = new Date(cap.capture_date);
            if (!isNaN(d.getTime())) {
                document.getElementById('edit-date').value = d.toISOString().split('T')[0];
            } else {
                document.getElementById('edit-date').value = '';
            }
        } else {
            document.getElementById('edit-date').value = '';
        }

        // Access list (only for private)
        updateAccessSectionVisibility('edit-visibility', 'edit-access-section');
        var accessEmails = (cap.access_list || []).map(function (a) { return a.user_email; }).filter(Boolean);
        var accessGroups = (cap.access_list || []).map(function (a) { return a.group_name; }).filter(Boolean);
        document.getElementById('edit-access-emails').value = accessEmails.join(', ');
        document.getElementById('edit-access-groups').value = accessGroups.join(', ');

        document.getElementById('edit-modal-overlay').classList.add('open');
    };

    window.closeEditModal = function () {
        document.getElementById('edit-modal-overlay').classList.remove('open');
    };

    window.saveEdit = async function () {
        var id = document.getElementById('edit-id').value;
        var fd = new FormData();

        fd.append('title', document.getElementById('edit-title').value.trim());
        fd.append('description', document.getElementById('edit-description').value.trim());
        fd.append('visibility', document.getElementById('edit-visibility').value);
        fd.append('sensor_model', document.getElementById('edit-sensor').value.trim());
        fd.append('location_name', document.getElementById('edit-location').value.trim());

        var lat = document.getElementById('edit-lat').value;
        if (lat) fd.append('latitude', lat);

        var lng = document.getElementById('edit-lng').value;
        if (lng) fd.append('longitude', lng);

        var captureDate = document.getElementById('edit-date').value;
        if (captureDate) fd.append('capture_date', captureDate);

        var tags = document.getElementById('edit-tags').value.trim();
        if (tags) {
            var tagList = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
            fd.append('tags', JSON.stringify(tagList));
        } else {
            fd.append('tags', '[]');
        }

        var vis = document.getElementById('edit-visibility').value;
        if (vis === 'private') {
            fd.append('access_emails', document.getElementById('edit-access-emails').value.trim());
            fd.append('access_groups', document.getElementById('edit-access-groups').value.trim());
        }

        try {
            await API.updateCapture(id, fd);
            showToast('Capture updated', 'success');
            closeEditModal();
            await loadAdminCaptures();
        } catch (err) {
            showToast('Update failed: ' + err.message, 'error');
        }
    };

    function setupVisibilityToggle() {
        var editVis = document.getElementById('edit-visibility');
        if (editVis) {
            editVis.addEventListener('change', function () {
                updateAccessSectionVisibility('edit-visibility', 'edit-access-section');
            });
        }
    }

    function updateAccessSectionVisibility(selectId, sectionId) {
        var sel = document.getElementById(selectId);
        var sec = document.getElementById(sectionId);
        if (sel && sec) {
            sec.style.display = sel.value === 'private' ? 'block' : 'none';
        }
    }

    /* ---------------------------------------------------------------
       Delete
       --------------------------------------------------------------- */

    window.openDeleteModal = function (captureId, captureName) {
        deleteTargetId = captureId;
        document.getElementById('delete-capture-name').textContent = captureName;
        document.getElementById('delete-modal-overlay').classList.add('open');
    };

    window.closeDeleteModal = function () {
        document.getElementById('delete-modal-overlay').classList.remove('open');
        deleteTargetId = null;
    };

    window.confirmDelete = async function () {
        if (!deleteTargetId) return;

        try {
            await API.deleteCapture(deleteTargetId);
            showToast('Capture deleted', 'success');
            closeDeleteModal();
            await Promise.all([loadAdminCaptures(), loadStats()]);
        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    };

    /* ---------------------------------------------------------------
       Reprocess
       --------------------------------------------------------------- */

    window.doReprocess = async function (captureId) {
        try {
            await API.reprocessCapture(captureId);
            showToast('Reprocessing started', 'success');
            await loadAdminCaptures();
        } catch (err) {
            showToast('Reprocess failed: ' + err.message, 'error');
        }
    };

    /* ---------------------------------------------------------------
       Close modals on overlay click
       --------------------------------------------------------------- */

    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.classList.remove('open');
            }
        });
    });

    // Close modals on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(function (overlay) {
                overlay.classList.remove('open');
            });
        }
    });

    /* ---------------------------------------------------------------
       Boot
       --------------------------------------------------------------- */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
