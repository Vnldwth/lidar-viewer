/* ===================================================================
   LiDAR Capture Viewer — Shared API Client & Helpers
   =================================================================== */

var API = {

    /* ---------------------------------------------------------------
       Low-level fetch wrappers
       --------------------------------------------------------------- */

    _handleResponse: async function (res) {
        if (res.ok) {
            if (res.status === 204) return null;
            return res.json();
        }
        var body;
        try { body = await res.json(); } catch (_) { body = null; }
        var msg = (body && body.detail) ? body.detail : 'Request failed (' + res.status + ')';
        throw new Error(msg);
    },

    get: async function (url) {
        var res = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin'
        });
        return API._handleResponse(res);
    },

    post: async function (url, data) {
        var res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return API._handleResponse(res);
    },

    postForm: async function (url, formData) {
        var res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
        });
        return API._handleResponse(res);
    },

    put: async function (url, data) {
        var res = await fetch(url, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return API._handleResponse(res);
    },

    putForm: async function (url, formData) {
        var res = await fetch(url, {
            method: 'PUT',
            credentials: 'same-origin',
            body: formData
        });
        return API._handleResponse(res);
    },

    del: async function (url) {
        var res = await fetch(url, {
            method: 'DELETE',
            credentials: 'same-origin'
        });
        return API._handleResponse(res);
    },

    /* ---------------------------------------------------------------
       Auth
       --------------------------------------------------------------- */

    getUser: async function () {
        try {
            return await API.get('/auth/me');
        } catch (_) {
            return { authenticated: false };
        }
    },

    login: function () {
        window.location = '/auth/login';
    },

    logout: function () {
        window.location = '/auth/logout';
    },

    /* ---------------------------------------------------------------
       Captures
       --------------------------------------------------------------- */

    getCaptures: async function (params) {
        var qs = '';
        if (params) {
            var parts = [];
            if (params.tag)    parts.push('tag=' + encodeURIComponent(params.tag));
            if (params.search) parts.push('search=' + encodeURIComponent(params.search));
            if (params.limit)  parts.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset) parts.push('offset=' + encodeURIComponent(params.offset));
            if (parts.length)  qs = '?' + parts.join('&');
        }
        return API.get('/api/captures' + qs);
    },

    getCapture: async function (id) {
        return API.get('/api/captures/' + encodeURIComponent(id));
    },

    /* ---------------------------------------------------------------
       Admin
       --------------------------------------------------------------- */

    getStats: async function () {
        return API.get('/api/admin/stats');
    },

    getAdminCaptures: async function () {
        return API.get('/api/admin/captures');
    },

    uploadCapture: async function (formData) {
        return API.postForm('/api/admin/captures', formData);
    },

    updateCapture: async function (id, formData) {
        return API.putForm('/api/admin/captures/' + encodeURIComponent(id), formData);
    },

    deleteCapture: async function (id) {
        return API.del('/api/admin/captures/' + encodeURIComponent(id));
    },

    reprocessCapture: async function (id) {
        return API.post('/api/admin/captures/' + encodeURIComponent(id) + '/reprocess');
    },

    getUsers: async function () {
        return API.get('/api/admin/users');
    }
};

/* ===================================================================
   Utility Helpers
   =================================================================== */

/**
 * Show a toast notification.
 *   type: 'info' | 'success' | 'error' | 'warning'
 */
function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
        toast.classList.add('toast-out');
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 220);
    }, 4000);
}

/**
 * Format a byte count to a human-readable string.
 */
function formatSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '--';
    if (bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    var val = bytes / Math.pow(1024, i);
    return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

/**
 * Format a point count (e.g. 12400000 -> "12.4M points").
 */
function formatPoints(count) {
    if (count == null || isNaN(count)) return '--';
    if (count >= 1e9) return (count / 1e9).toFixed(1) + 'B';
    if (count >= 1e6) return (count / 1e6).toFixed(1) + 'M';
    if (count >= 1e3) return (count / 1e3).toFixed(1) + 'K';
    return String(count);
}

/**
 * Format an ISO date string to a readable date.
 */
function formatDate(isoString) {
    if (!isoString) return '--';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    var months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/**
 * Debounce a function call.
 */
function debounce(fn, ms) {
    var timer;
    return function () {
        var ctx = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
}

/**
 * Escape HTML entities in a string.
 */
function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Set up the nav bar's auth state.
 * Call on every page load; pass a container element with id="nav-auth".
 */
async function initNavAuth() {
    var el = document.getElementById('nav-auth');
    if (!el) return null;

    var user;
    try {
        user = await API.getUser();
    } catch (_) {
        user = { authenticated: false };
    }

    if (user && user.authenticated) {
        var initials = '';
        if (user.name) {
            var parts = user.name.trim().split(/\s+/);
            initials = parts.map(function(p){ return p[0]; }).join('').substring(0, 2);
        } else if (user.email) {
            initials = user.email[0];
        }

        var html = '<div class="nav-user">';
        html += '<div class="nav-user-avatar">' + escapeHtml(initials) + '</div>';
        html += '<span class="nav-user-name">' + escapeHtml(user.name || user.email) + '</span>';
        html += '</div>';
        if (user.is_admin) {
            html += '<a href="/admin" class="btn btn-sm btn-secondary">Admin</a>';
        }
        html += '<button class="btn btn-sm" onclick="API.logout()">Sign Out</button>';
        el.innerHTML = html;
    } else {
        el.innerHTML = '<button class="btn btn-sm btn-primary" onclick="API.login()">Sign In</button>';
    }

    return user;
}
