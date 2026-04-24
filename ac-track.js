(function () {
  const BRIDGE_URL = '/api/bridge';
  const SESSION_KEY = 'acTrackingSession';
  const ATTRIBUTION_KEY = 'acTrackingAttribution';
  const SESSION_COOKIE = 'acTrackingHash';
  const SESSION_SLUG_COOKIE = 'acTrackingSlug';
  const SESSION_TTL_MS = 60 * 60 * 1000;
  const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
  const VIDEO_THRESHOLDS = [25, 50, 75, 100];
  const UPDATE_ONLY_EVENTS = {
    page_view_business_info: true,
    page_view_result: true,
    business_interest_open: true,
    business_interest_not_now: true,
    business_personality_selected: true,
    video_play: true,
    video_25: true,
    video_50: true,
    video_75: true,
    video_100: true,
  };
  const videoRegistry = [];

  function safeJsonParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Silently fail on storage errors (privacy mode, quota exceeded)
    }
  }

  function removeLocalStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // Silently fail on storage errors
    }
  }

  function readCookie(name) {
    const source = document.cookie || '';
    const prefix = name + '=';
    const parts = source.split(';');
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i].trim();
      if (part.indexOf(prefix) === 0) {
        return decodeURIComponent(part.slice(prefix.length));
      }
    }
    return '';
  }

  function normalizeQuizSlug(slug) {
    return String(slug || extractSlugFromPath() || 'default').toLowerCase();
  }

  function writeSessionCookie(hash, slug) {
    if (!hash) return;
    const normalizedSlug = normalizeQuizSlug(slug);
    document.cookie = [
      SESSION_COOKIE + '=' + encodeURIComponent(String(hash)),
      'Max-Age=' + SESSION_TTL_SECONDS,
      'Path=/',
      'SameSite=Lax',
      'Secure',
    ].join('; ');
    document.cookie = [
      SESSION_SLUG_COOKIE + '=' + encodeURIComponent(normalizedSlug),
      'Max-Age=' + SESSION_TTL_SECONDS,
      'Path=/',
      'SameSite=Lax',
      'Secure',
    ].join('; ');
  }

  function readCoachMemberId() {
    const coach = safeJsonParse(readLocalStorage('acCoach'));
    if (!coach || !coach.member_id) return '';
    return String(coach.member_id);
  }

  function nowTs() {
    return Date.now();
  }

  function randomHex(bytesCount) {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(bytesCount);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map
        .call(bytes, function (value) {
          return value.toString(16).padStart(2, '0');
        })
        .join('');
    }
    let fallback = '';
    while (fallback.length < bytesCount * 2) {
      fallback += Math.random().toString(16).slice(2);
    }
    return fallback.slice(0, bytesCount * 2);
  }

  function generateSessionHash() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'ac_' + window.crypto.randomUUID().replace(/-/g, '');
    }
    return 'ac_' + nowTs().toString(36) + '_' + randomHex(16);
  }

  function extractSlugFromPath() {
    const path = (window.location.pathname || '').replace(/^\/+/, '').toLowerCase();
    const slug = path.split('/')[0] || '';
    return slug === 'api' || !slug || slug.includes('.html') ? '' : slug;
  }

  function readStoredSession() {
    const parsed = safeJsonParse(readLocalStorage(SESSION_KEY));
    if (!parsed || !parsed.hash) return null;
    return parsed;
  }

  function readCookieSession(slug) {
    const cookieHash = readCookie(SESSION_COOKIE);
    const cookieSlug = normalizeQuizSlug(readCookie(SESSION_SLUG_COOKIE));
    const currentSlug = normalizeQuizSlug(slug);
    if (!cookieHash) return null;
    if (String(cookieHash).indexOf('ac_') !== 0) return null;
    if (cookieSlug && cookieSlug !== currentSlug) return null;
    return {
      hash: String(cookieHash),
      memberId: '',
      slug: currentSlug,
      updatedAt: nowTs(),
    };
  }

  function persistSession(hash, memberId, slug) {
    if (!hash) return;
    writeLocalStorage(
      SESSION_KEY,
      JSON.stringify({
        hash: String(hash),
        memberId: String(memberId || ''),
        slug: String(slug || ''),
        updatedAt: nowTs(),
      })
    );
    writeSessionCookie(hash, slug);
  }

  function getReusableSession(memberId, slug) {
    const existing = readStoredSession();
    const currentSlug = normalizeQuizSlug(slug);

    if (
      existing &&
      existing.hash &&
      String(existing.hash).indexOf('ac_') === 0 &&
      existing.updatedAt
    ) {
      if (nowTs() - Number(existing.updatedAt) <= SESSION_TTL_MS) {
        // Session ist gültig wenn: gleiche memberId UND gleicher slug
        const sameCoach = !memberId || !existing.memberId || existing.memberId === memberId;
        const sameSlug = !currentSlug || !existing.slug || existing.slug === currentSlug;
        if (sameCoach && sameSlug) {
          return existing;
        }
      }
      // Ungültig: andere Coach oder anderer Slug
      removeLocalStorage(SESSION_KEY);
    }

    const cookieSession = readCookieSession(currentSlug);
    if (!cookieSession || !cookieSession.hash) return null;
    if (memberId) cookieSession.memberId = String(memberId);
    return cookieSession;
  }

  function getSessionForEvent(eventName, resetSession, memberId, slug) {
    const currentSlug = normalizeQuizSlug(slug);

    const reusable = getReusableSession(memberId, currentSlug);
    if (reusable && reusable.hash) return reusable;

    if (resetSession) {
      return {
        hash: generateSessionHash(),
        memberId: String(memberId || ''),
        slug: String(currentSlug || ''),
        updatedAt: nowTs(),
      };
    }

    if (UPDATE_ONLY_EVENTS[eventName]) {
      return null;
    }

    // Fallback: Generate new session hash if no quiz hash exists
    return {
      hash: generateSessionHash(),
      memberId: String(memberId || ''),
      slug: String(currentSlug || ''),
      updatedAt: nowTs(),
    };
  }

  function detectDeviceType() {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/ipad|tablet/.test(ua)) return 'tablet';
    if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
    return 'desktop';
  }

  function detectOperatingSystem() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'MacOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  }

  function detectBrowser() {
    const ua = navigator.userAgent || '';
    if (/Edg/i.test(ua)) return 'Edge';
    if (/OPR|Opera/i.test(ua)) return 'Opera';
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    if (/Firefox/i.test(ua)) return 'Firefox';
    return 'Unknown';
  }

  function parseCountryFromLanguage() {
    const lang = navigator.language || '';
    const parts = lang.split('-');
    if (parts.length < 2) return '';
    return String(parts[1] || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2);
  }

  function buildAttribution() {
    const stored = safeJsonParse(readLocalStorage(ATTRIBUTION_KEY)) || {};
    const params = new URLSearchParams(window.location.search || '');
    const next = {
      utm_source: stored.utm_source || params.get('utm_source') || '',
      utm_medium: stored.utm_medium || params.get('utm_medium') || '',
      utm_campaign: stored.utm_campaign || params.get('utm_campaign') || '',
      utm_content: stored.utm_content || params.get('utm_content') || '',
      referrer: stored.referrer || document.referrer || '',
    };
    writeLocalStorage(ATTRIBUTION_KEY, JSON.stringify(next));
    return next;
  }

  function normalizeTrackResponse(data, memberId, slug) {
    if (!data || !data.session_hash) return data;
    persistSession(data.session_hash, memberId, slug);
    return data;
  }

  function track(eventName, options) {
    options = options || {};
    if (!eventName || typeof window.fetch !== 'function') return Promise.resolve(null);

    const memberId = String(options.memberId || readCoachMemberId() || '');
    const slug = extractSlugFromPath();
    const session = getSessionForEvent(eventName, Boolean(options.resetSession), memberId, slug);
    if (!session) return Promise.resolve(null);

    const attribution = buildAttribution();

    if (session.hash) {
      persistSession(session.hash, memberId || session.memberId || '', slug || session.slug || '');
    }

    return window
      .fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          action: 'track_event',
          event_name: String(eventName),
          page_key: String(options.pageKey || ''),
          session_hash: session.hash ? String(session.hash) : '',
          reset_session: Boolean(options.resetSession),
          member_id: memberId,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_content: attribution.utm_content,
          referrer: attribution.referrer,
          lang: String((navigator.language || 'de').split('-')[0].toLowerCase()),
          country: String(options.country || parseCountryFromLanguage()),
          device_type: String(options.deviceType || detectDeviceType()),
          os: String(options.os || detectOperatingSystem()),
          browser: String(options.browser || detectBrowser()),
          video_id: options.videoId ? String(options.videoId) : '',
          progress_percent:
            options.progressPercent !== null ? Number(options.progressPercent) : null,
        }),
      })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        return normalizeTrackResponse(data, memberId, slug);
      })
      .catch(function () {
        return null;
      });
  }

  function trackPageView(eventName, pageKey) {
    return track(eventName, {
      pageKey: pageKey,
      resetSession: true,
    });
  }

  function registerVideo(config) {
    if (!config || !config.iframeId || !config.videoId || !config.pageKey) return;
    const iframe = document.getElementById(config.iframeId);
    if (!iframe) return;

    function attachWithPlayerjs() {
      if (typeof playerjs === 'undefined') return;
      const player = new playerjs.Player(iframe);
      const thresholds = {};
      let playTracked = false;
      player.on('ready', function () {
        player.on('play', function () {
          if (!playTracked) {
            playTracked = true;
            track('video_play', { pageKey: config.pageKey, videoId: config.videoId });
          }
        });
        player.on('timeupdate', function (data) {
          if (!data || !(data.duration > 0)) return;
          const percent = Math.min(100, Math.floor((data.seconds / data.duration) * 100));
          VIDEO_THRESHOLDS.forEach(function (threshold) {
            if (percent >= threshold && !thresholds[threshold]) {
              thresholds[threshold] = true;
              track('video_' + threshold, {
                pageKey: config.pageKey,
                videoId: config.videoId,
                progressPercent: threshold,
              });
            }
          });
        });
        player.on('ended', function () {
          if (!thresholds[100]) {
            thresholds[100] = true;
            track('video_100', {
              pageKey: config.pageKey,
              videoId: config.videoId,
              progressPercent: 100,
            });
          }
        });
      });
    }

    // Wait for playerjs to be available (it may load after ac-track.js)
    if (typeof playerjs !== 'undefined') {
      attachWithPlayerjs();
    } else {
      window.addEventListener('load', attachWithPlayerjs);
    }
  }

  window.acTrack = track;
  window.acTrackPageView = trackPageView;
  window.acTrackVideo = registerVideo;
})();
