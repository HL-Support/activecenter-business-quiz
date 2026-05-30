/* eslint-disable prefer-const */
import React from 'react';
import {
  getPreferredLang,
  setPreferredLang as vu,
  t as a,
  storage as le,
  videoProgressStore as ld,
  trackQuizAnalytics as Dt,
  submitMauticLead as Hp,
  forwardQuizSubmission as Qp,
  getVideoConfig as Ap,
  getAspirationLabel,
  getQuestions as jp,
  getProfiles as Bp,
  getAnalyzingSteps as Up,
  getCoachFromStorage,
  pageLayout as at,
  panelStyle as ct,
  titleStyle as dt,
  badgeStyle as Ot,
  primaryButtonStyle as In,
  secondaryButtonStyle as Su,
  inputStyle as od,
  resetLeadRun as resetRun,
  getActiveLeadRun,
  isLeadSystemV2Active,
} from '../lib/core.js';

const VIDEO_FULL_COMPLETION_KEY_PREFIX = 'acVideoFullCompletion_';
const VIDEO_COMPLETION_NOTIFY_KEY_PREFIX = 'acVideoCompletionCoachNotify_';
const VIDEO_POINTS_COMPLETION_KEY_PREFIX = 'acVideoPointsCompletion_';

function readStoredObject(key) {
  try {
    return JSON.parse(le.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function storeObject(key, value) {
  try {
    le.setItem(key, JSON.stringify(value || {}));
  } catch {
    // Storage failure is non-critical for progress bookkeeping.
  }
}

function leadScopedVideoKey(prefix, slug, memberId) {
  const leadRun = getActiveLeadRun(slug, memberId);
  return {
    key: `${prefix}${slug}_${leadRun?.lead_hash || leadRun?.session_hash || 'anonymous'}`,
    leadRun,
  };
}

function sendVideoProgressWebhook(
  slug,
  memberId,
  completedStep,
  videoSteps,
  completionReason = 'unique_watch_95'
) {
  const totalSteps = Object.keys(videoSteps).length;
  const { key, leadRun } = leadScopedVideoKey(VIDEO_POINTS_COMPLETION_KEY_PREFIX, slug, memberId);
  const sessionHash = leadRun?.session_hash || '';
  const leadHash = leadRun?.lead_hash || '';
  if (!sessionHash && !leadHash) return;
  if (completionReason === 'manual_unlock') return;

  const completed = readStoredObject(key);
  completed[completedStep] = true;
  storeObject(key, completed);
  if (isLeadSystemV2Active(slug)) return;
  const completedCount = Object.keys(completed)
    .map((step) => Number(step))
    .filter((step) => completed[step] === true && step >= 1 && step <= totalSteps).length;

  fetch('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      action: 'update_points_result',
      payload: {
        lead_hash: leadHash,
        session_hash: sessionHash,
        berater_slug: slug,
        member_id: memberId,
        lang: getPreferredLang(),
        video_step: completedStep,
        completed_count: completedCount,
        total_videos: totalSteps,
        completion_reason: completionReason,
      },
    }),
  }).catch(() => {});
}

function sendAllVideosCompletedCoachNotification(slug, memberId, completedStep, videoSteps) {
  const totalSteps = Object.keys(videoSteps).length;
  const { key, leadRun } = leadScopedVideoKey(VIDEO_FULL_COMPLETION_KEY_PREFIX, slug, memberId);
  const completed = readStoredObject(key);
  completed[completedStep] = true;
  storeObject(key, completed);

  const completedSteps = Object.keys(completed)
    .map((step) => Number(step))
    .filter((step) => completed[step] === true && step >= 1 && step <= totalSteps)
    .sort((left, right) => left - right);

  if (completedSteps.length < totalSteps) return;

  const notifyKey = `${VIDEO_COMPLETION_NOTIFY_KEY_PREFIX}${slug}_${leadRun?.lead_hash || leadRun?.session_hash || 'anonymous'}`;
  if (le.getItem(notifyKey) === 'sent') return;

  fetch('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      action: 'notify_all_videos_completed',
      payload: {
        hash: leadRun?.lead_hash || '',
        lead_hash: leadRun?.lead_hash || '',
        session_hash: leadRun?.session_hash || '',
        berater_slug: slug,
        member_id: memberId,
        lang: getPreferredLang(),
        completed_steps: completedSteps,
        completed_at: new Date().toISOString(),
      },
    }),
  })
    .then((response) => response.json().catch(() => ({})))
    .then((data) => {
      if (data && data.success && data.email_sent) {
        le.setItem(notifyKey, 'sent');
      }
    })
    .catch(() => {});
}

function qp(iframeId, videoStep, onUnlocked, onStatus, options = {}) {
  const iframe = document.getElementById(iframeId);
  if (!iframe) {
    onStatus && onStatus({ status: 'error', reason: 'iframe_missing' });
    return () => {};
  }

  let destroyed = !1,
    unlocked = !1,
    hasProgress = !1,
    playTracked = !1,
    duration = 0,
    lastSecond = 0,
    maxPlayheadPercent = 0,
    maxAllowedSecond = 0,
    seekCount = 0,
    readyTimeout = null,
    progressTimeout = null,
    durationTimeout = null,
    progressBuckets = {},
    watchedSeconds = new Set(),
    videoId = options.videoId || `quiz_video_${videoStep}`,
    resumeStartPercent = Math.max(0, Math.min(90, Number(options.resumeStartPercent || 0))),
    resumeApplied = resumeStartPercent <= 0;

  function setStatus(status, reason) {
    onStatus && !destroyed && onStatus({ status, reason: reason || null });
  }

  function track(eventName, extra = {}) {
    Dt(eventName, {
      video_step: videoStep,
      video_id: videoId,
      ...extra,
    });
  }

  function trackHealth(issue, context) {
    track('video_health', {
      video_issue: issue,
      video_issue_context: context || '',
      video_issue_at: new Date().toISOString(),
    });
  }

  function compactRanges() {
    let seconds = Array.from(watchedSeconds).sort((a, b) => a - b),
      ranges = [],
      start = null,
      prev = null;
    seconds.forEach((second) => {
      if (start === null) {
        start = second;
        prev = second;
        return;
      }
      if (second === prev + 1) {
        prev = second;
        return;
      }
      ranges.push([start, prev + 1]);
      start = second;
      prev = second;
    });
    if (start !== null) ranges.push([start, prev + 1]);
    return ranges;
  }

  function uniqueWatchedPercent() {
    return duration > 0 ? Math.min(100, Math.floor((watchedSeconds.size / duration) * 100)) : 0;
  }

  function buildProgressPayload(method, bucket) {
    const prefix = 'video' + videoStep,
      percent = uniqueWatchedPercent(),
      payload = {};
    payload[prefix + '_watched_sec'] = watchedSeconds.size;
    payload[prefix + '_max_pct'] = percent;
    payload[prefix + '_unique_watched_pct'] = percent;
    payload[prefix + '_max_playhead_pct'] = maxPlayheadPercent;
    payload[prefix + '_seek_count'] = seekCount;
    payload[prefix + '_last_update'] = new Date().toISOString();
    payload[prefix + '_tracking_method'] = method;
    payload.video_step = videoStep;
    payload.video_id = videoId;
    payload.duration_seconds = Math.floor(duration || 0);
    payload.unique_watched_seconds = watchedSeconds.size;
    payload.unique_watched_percent = percent;
    payload.max_playhead_percent = maxPlayheadPercent;
    payload.seek_count = seekCount;
    payload.progress_percent = bucket || percent;
    payload.watched_ranges = compactRanges();
    return payload;
  }

  function emitProgress(method, force = !1) {
    const percent = uniqueWatchedPercent(),
      bucket = Math.floor(percent / 5) * 5;
    if (bucket > 0 && (force || !progressBuckets[bucket])) {
      progressBuckets[bucket] = !0;
      track('video_progress', buildProgressPayload(method, bucket));
    }
    if (percent >= 95) unlock('unique_watch_95');
  }

  function unlock(reason) {
    if (destroyed || unlocked) return;
    unlocked = !0;
    readyTimeout && clearTimeout(readyTimeout);
    progressTimeout && clearTimeout(progressTimeout);
    durationTimeout && clearTimeout(durationTimeout);
    track('video_unlocked', buildProgressPayload(reason, 95));
    setStatus('unlocked');
    onUnlocked && onUnlocked(reason);
  }

  function markWatched(from, to) {
    if (!(duration > 0)) return;
    const start = Math.max(0, Math.floor(Math.min(from, to))),
      end = Math.min(Math.ceil(Math.max(from, to)), Math.ceil(duration));
    for (let second = start; second < end; second += 1) {
      watchedSeconds.add(second);
    }
    maxAllowedSecond = Math.max(maxAllowedSecond, end + 2);
  }

  function seedResumeProgress(player) {
    if (resumeApplied || !(duration > 0)) return;
    resumeApplied = !0;
    const startSecond = Math.max(
      0,
      Math.min(Math.floor((duration * resumeStartPercent) / 100), Math.max(0, Math.floor(duration - 3)))
    );
    if (startSecond <= 0) return;

    for (let second = 0; second < startSecond; second += 1) {
      watchedSeconds.add(second);
    }
    maxAllowedSecond = Math.max(maxAllowedSecond, startSecond + 2);
    lastSecond = startSecond;
    maxPlayheadPercent = Math.max(maxPlayheadPercent, resumeStartPercent);
    track('video_resume_seek', {
      resume_start_percent: resumeStartPercent,
      resume_start_second: startSecond,
    });
    try {
      player.setCurrentTime(startSecond);
    } catch {
      trackHealth('resume_seek_failed', String(startSecond));
    }
  }

  function seekBack(player, attemptedSecond) {
    const allowed = Math.max(0, Math.min(maxAllowedSecond, duration || maxAllowedSecond));
    seekCount += 1;
    track('video_seeked', {
      attempted_second: Math.floor(attemptedSecond || 0),
      allowed_second: Math.floor(allowed),
      seek_count: seekCount,
    });
    try {
      player.setCurrentTime(allowed);
    } catch {
      trackHealth('seekback_failed', String(allowed));
    }
    lastSecond = allowed;
  }

  if (typeof playerjs > 'u') {
    trackHealth('playerjs_missing');
    setStatus('error', 'playerjs_missing');
    return () => {
      destroyed = !0;
    };
  }

  const player = new playerjs.Player(iframe);

  readyTimeout = setTimeout(function () {
    destroyed || unlocked || (trackHealth('ready_timeout'), setStatus('error', 'ready_timeout'));
  }, 8e3);

  player.on('ready', function () {
    if (destroyed || unlocked) return;
    clearTimeout(readyTimeout);
    setStatus('ready');

    player.on('play', function () {
      if (!playTracked) {
        playTracked = !0;
        track('video_started', { video_started_at: new Date().toISOString() });
      }
    });

    player.on('seeked', function (data) {
      const current = data && typeof data.seconds === 'number' ? data.seconds : lastSecond;
      if (duration > 0 && current > maxAllowedSecond + 1) seekBack(player, current);
    });

    player.on('timeupdate', function (data) {
      if (destroyed || !data || !(data.duration > 0)) return;
      duration = data.duration;
      const current = Math.max(0, Number(data.seconds || 0));
      seedResumeProgress(player);
      hasProgress ||
        ((hasProgress = !0),
        progressTimeout && clearTimeout(progressTimeout),
        setStatus('tracking'));
      maxPlayheadPercent = Math.max(maxPlayheadPercent, Math.floor((current / duration) * 100));

      const delta = current - lastSecond;
      if (lastSecond > 0 && delta > 8 && current > maxAllowedSecond + 4) {
        seekBack(player, current);
        return;
      }

      if (delta > 0 && delta <= 8) {
        markWatched(lastSecond, current);
        emitProgress('playerjs_unique_watch');
      }
      lastSecond = current;
    });

    player.on('ended', function () {
      if (destroyed) return;
      markWatched(lastSecond, duration || lastSecond);
      const completedPayload = buildProgressPayload('playerjs_ended', 100);
      track('video_completed', completedPayload);
      if (options.onCompleted) options.onCompleted(videoStep, completedPayload);
      emitProgress('playerjs_ended', !0);
      if (uniqueWatchedPercent() >= 95) unlock('ended');
    });

    progressTimeout = setTimeout(function () {
      destroyed ||
        unlocked ||
        hasProgress ||
        (trackHealth('progress_timeout'), setStatus('error', 'progress_timeout'));
    }, 12e3);

    durationTimeout = setTimeout(function () {
      if (!destroyed && !unlocked && !(duration > 0)) {
        trackHealth('duration_timeout');
        setStatus('stalled', 'duration_timeout');
      }
    }, 5e3);

    player.getDuration(function (value) {
      if (destroyed || unlocked) return;
      durationTimeout && clearTimeout(durationTimeout);
      if (value > 0) duration = value;
    });
  });

  return () => {
    destroyed = !0;
    readyTimeout && clearTimeout(readyTimeout);
    progressTimeout && clearTimeout(progressTimeout);
    durationTimeout && clearTimeout(durationTimeout);
  };
}
function OptinStep({ profile: e, answers: t, berater: n, aspiration: r, visible: l, onSubmit: o }) {
  const [i, u] = React.useState(''),
    [s, d] = React.useState(''),
    [g, y] = React.useState(!1),
    [S, k] = React.useState(''),
    I = e?.accentColor || '#C9A84C',
    f = s.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    c = i.trim().length > 0 && f && !S,
    m = (C) => {
      d(C);
      if (S) k('');
    },
    v = async () => {
      if (g) return;
      if (!i.trim() || !s.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        k(a('optin_email_error_format'));
        return;
      }
      y(!0);
      const C = i.trim(),
        z = s.trim();
      try {
        Dt('form_submit', {
          form_first_name: C,
          form_email: z,
          form_submitted_at: new Date().toISOString(),
        });
        await Hp({
          vorname: C,
          email: z,
          typ: e?.animal || '',
          barriere: t[5]?.barrier || '',
          aspiration: r,
          berater: n,
        });
        const submitResult = await Qp(C, z, t, e, r);
        if (!submitResult || submitResult.success === false || submitResult.error) {
          throw new Error(submitResult?.error || 'submit_failed');
        }
        ld.clear(n || 'default');
        try {
          if (typeof window.fbq === 'function') {
            window.fbq('track', 'Lead', {
              content_name: 'Erfolgscode Quiz',
              content_category: 'Business Opportunity',
            });
          }
        } catch (_fbqError) {
          // pixel error is non-critical
        }
        try {
          !isLeadSystemV2Active(n || 'default') &&
            window.acTrack &&
            (await Promise.race([
              window.acTrack('quiz_form_submit', { pageKey: 'quiz' }),
              new Promise((V) => setTimeout(V, 500)),
            ]));
        } catch (_error) {
          // intentionally empty - tracking error is non-critical
        }
        y(!1);
        o();
      } catch (error) {
        console.warn('Quiz submission failed:', error?.message || error);
        y(!1);
        k(a('optin_submit_error'));
      }
    };
  React.useEffect(() => {
    Dt('optin_viewed', {
      quiz_profile: e?.code || '',
      quiz_profile_name: e?.name || '',
      quiz_aspiration: r || 'freedom',
      main_aspiration: r || 'freedom',
      main_aspiration_label: getAspirationLabel(r || 'freedom'),
      optin_viewed_at: new Date().toISOString(),
    });
  }, [e, r]);
  return React.createElement(
    'div',
    { style: at },
    React.createElement(
      'div',
      { style: { ...ct(l), maxWidth: '620px', textAlign: 'center' } },
      React.createElement('div', { style: { fontSize: '42px', marginBottom: '8px' } }, e?.emoji),
      React.createElement('span', { style: Ot }, a('optin_badge')),
      React.createElement(
        'h2',
        { style: { ...dt(36, { fontWeight: '700', marginBottom: '12px' }) } },
        a('optin_h2_line1'),
        React.createElement('br', null),
        React.createElement('em', { style: { color: I } }, a('optin_h2_line2'))
      ),
      React.createElement(
        'p',
        {
          style: {
            color: 'rgba(245,240,232,0.52)',
            fontSize: '14px',
            lineHeight: 1.7,
            marginBottom: '22px',
          },
        },
        a('optin_body')
      ),
      React.createElement(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
            gap: '9px',
            marginBottom: '18px',
          },
        },
        ['optin_teaser_1', 'optin_teaser_2', 'optin_teaser_3', 'optin_teaser_4'].map(
          (C, z) =>
            React.createElement(
              'div',
              {
                key: C,
                style: {
                  background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${I}1F`,
                  borderRadius: '12px',
                  padding: '12px 13px',
                  textAlign: 'left',
                  minHeight: '56px',
                  opacity: 0.78,
                },
              },
              React.createElement(
                'div',
                {
                  style: {
                    color: I,
                    fontSize: '10px',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    marginBottom: '5px',
                  },
                },
                String(z + 1).padStart(2, '0')
              ),
              React.createElement(
                'p',
                {
                  style: {
                    color: 'rgba(245,240,232,0.68)',
                    fontSize: '12.5px',
                    lineHeight: 1.45,
                  },
                },
                a(C)
              )
            )
        )
      ),
      React.createElement(
        'div',
        {
          style: {
            background: `linear-gradient(180deg, ${I}18 0%, rgba(255,255,255,0.045) 100%)`,
            border: `1px solid ${I}55`,
            borderRadius: '20px',
            padding: '20px',
            textAlign: 'left',
            boxShadow: `0 22px 70px ${I}12, inset 0 1px 0 rgba(255,255,255,0.08)`,
            marginTop: '4px',
            position: 'relative',
            overflow: 'hidden',
          },
        },
        React.createElement('div', {
          style: {
            position: 'absolute',
            top: '-52px',
            right: '-42px',
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            background: `${I}1C`,
            filter: 'blur(6px)',
          },
        }),
        React.createElement(
          'div',
          { style: { position: 'relative', marginBottom: '16px' } },
          React.createElement(
            'span',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                color: '#0A0A0A',
                background: I,
                borderRadius: '100px',
                padding: '6px 11px',
                fontSize: '10px',
                fontWeight: '800',
                letterSpacing: '1.9px',
                textTransform: 'uppercase',
                marginBottom: '11px',
              },
            },
            '\u2713 ',
            a('optin_form_badge')
          ),
          React.createElement(
            'h3',
            {
              style: {
                color: '#F5F0E8',
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 'clamp(25px, 3vw, 34px)',
                lineHeight: 1.12,
                margin: '0 0 7px',
                fontWeight: '700',
              },
            },
            a('optin_form_heading')
          ),
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.62)',
                fontSize: '13.5px',
                lineHeight: 1.6,
                margin: 0,
              },
            },
            a('optin_form_subheading')
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: '13px',
              marginBottom: '16px',
            },
          },
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              {
                style: {
                  color: 'rgba(245,240,232,0.64)',
                  fontSize: '10.5px',
                  letterSpacing: '2.5px',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '7px',
                },
              },
              a('optin_label_firstname')
            ),
            React.createElement('input', {
              type: 'text',
              placeholder: a('optin_placeholder_firstname'),
              value: i,
              onChange: (C) => u(C.target.value),
              style: {
                ...od,
                background: 'rgba(7,11,20,0.62)',
                borderColor: 'rgba(245,240,232,0.16)',
                borderRadius: '14px',
                padding: '16px 18px',
                fontSize: '16px',
              },
              onFocus: (C) => (C.target.style.borderColor = I),
              onBlur: (C) => (C.target.style.borderColor = 'rgba(245,240,232,0.16)'),
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              {
                style: {
                  color: 'rgba(245,240,232,0.64)',
                  fontSize: '10.5px',
                  letterSpacing: '2.5px',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '7px',
              },
            },
            a('optin_label_email'),
              ' '
            ),
            React.createElement('input', {
              type: 'email',
              placeholder: a('optin_placeholder_email'),
              value: s,
              onChange: (C) => m(C.target.value),
              onKeyDown: (C) => C.key === 'Enter' && c && v(),
              style: {
                ...od,
                background: 'rgba(7,11,20,0.62)',
                borderColor: S ? '#ff6b6b' : 'rgba(245,240,232,0.16)',
                borderRadius: '14px',
                padding: '16px 18px',
                fontSize: '16px',
              },
              onFocus: (C) => (C.target.style.borderColor = S ? '#ff6b6b' : I),
              onBlur: (C) =>
                (C.target.style.borderColor = S ? '#ff6b6b' : 'rgba(245,240,232,0.16)'),
            }),
            S &&
              React.createElement(
                'p',
                {
                  style: { color: '#ff6b6b', fontSize: '12px', marginTop: '5px' },
                },
                '\u26A0\uFE0F ',
                S
              )
          )
        ),
        React.createElement(
          'button',
          {
            onClick: v,
            disabled: !c || g,
            style: {
              ...In(I, '#0A0A0A', {
                width: '100%',
                minHeight: '58px',
                fontSize: '16px',
                fontWeight: '800',
                boxShadow: c && !g ? `0 16px 42px ${I}30` : 'none',
              }),
              opacity: c && !g ? 1 : 0.42,
              cursor: c && !g ? 'pointer' : 'not-allowed',
            },
          },
          a(g ? 'optin_btn_loading' : 'optin_btn_submit')
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.38)',
              fontSize: '11.5px',
              lineHeight: 1.55,
              margin: '13px 0 0',
              textAlign: 'center',
            },
          },
          '\u{1F512} ',
          a('optin_privacy')
        )
      )
    )
  );
}
function VideoStep({
  profile: e,
  videoStep: t,
  videos: n,
  visible: r,
  onNext: l,
  onPrev: o,
  onVideoReached95: i,
  onVideoFullyCompleted: b,
  resumeStartPercent = 0,
}) {
  const u = n[t];
  if (!u) return null;
  const s = Object.keys(n).map(Number),
    d = t === s.length,
    g = e?.accentColor || '#C9A84C',
    [y, h] = React.useState(!1),
    [S, k] = React.useState('loading'),
    [I, f] = React.useState(null),
    [c, m] = React.useState(0),
    T = `video-frame-${t}-${c}`,
    V = React.useMemo(() => le.getItem('acBeraterSlug') || 'default', []),
    M = s.filter((w) => w > t),
    J = function (w) {
      const L = {
        video_step: t,
        video_recovery_action: w,
        video_recovery_at: new Date().toISOString(),
      };
      Dt('video_recovery', L);
    };
  return (
    React.useEffect(() => {
      const w = ld.isVideoCompleted(V, t);
      (h(w), w ? (k('unlocked'), f(null)) : (k('loading'), f(null)));
      Dt('video_viewed', {
        video_step: t,
        video_id: u.id || `quiz_video_${t}`,
        video_viewed_at: new Date().toISOString(),
      });
      const L = qp(
        T,
        t,
        (unlockReason) => {
          (h(!0), ld.setVideoCompleted(V, t), k('unlocked'), f(null), i && i(t, unlockReason));
        },
        function (j) {
          (j?.status && k(j.status), f(j?.reason || null));
        },
        {
          videoId: u.id || `quiz_video_${t}`,
          resumeStartPercent,
          onCompleted: (j) => b && b(j),
        }
      );
      return () => {
        L && L();
      };
    }, [t, V, T, i, b, resumeStartPercent, u.id]),
    React.createElement(
      'div',
      { style: { ...at, justifyContent: 'flex-start', paddingTop: '28px' } },
      React.createElement(
        'div',
        {
          style: {
            width: '100%',
            maxWidth: '720px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        },
        React.createElement(
          'span',
          {
            style: {
              color: g,
              fontSize: '10.5px',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
            },
          },
          a('video_counter'),
          ' ',
          t
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '6px' } },
          s.map((w) =>
            React.createElement('div', {
              key: w,
              style: {
                width: '28px',
                height: '3px',
                borderRadius: '100px',
                background: w <= t ? g : 'rgba(255,255,255,0.1)',
                transition: 'background 0.4s ease',
              },
            })
          )
        )
      ),
      React.createElement(
        'div',
        { style: { ...ct(r), maxWidth: '720px' } },
        React.createElement('span', { style: { ...Ot, color: g } }, u.title),
        React.createElement(
          'h2',
          { style: { ...dt(26, { fontWeight: '600', marginBottom: '18px' }) } },
          u.sub
        ),
        React.createElement(
          'div',
          {
            style: {
              position: 'relative',
              paddingTop: '56.25%',
              borderRadius: '16px',
              overflow: 'hidden',
              marginBottom: '22px',
            },
          },
          React.createElement('iframe', {
            id: T,
            src: `https://player.mediadelivery.net/embed/${u.lib}/${u.id}?autoplay=true&loop=false&muted=false&preload=true&responsive=true&cacheBust=${c}`,
            loading: 'lazy',
            style: {
              border: '0',
              position: 'absolute',
              top: 0,
              height: '100%',
              width: '100%',
            },
            allow: 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture',
            allowFullScreen: !0,
          })
        ),
        !d &&
          React.createElement(
            'div',
            { style: { display: 'flex', gap: '8px', marginBottom: '22px' } },
            M.map((w) =>
              React.createElement(
                'div',
                {
                  key: w,
                  style: {
                    flex: 1,
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  },
                },
                React.createElement(
                  'p',
                  {
                    style: {
                      color: 'rgba(245,240,232,0.3)',
                      fontSize: '10px',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      marginBottom: '4px',
                    },
                  },
                  a('video_next_label')
                ),
                React.createElement(
                  'p',
                  {
                    style: {
                      color: 'rgba(245,240,232,0.55)',
                      fontSize: '12.5px',
                    },
                  },
                  n[w].title
                )
              )
            )
          ),
        (S === 'error' || S === 'stalled') &&
          !y &&
          React.createElement(
            'div',
            {
              style: {
                marginBottom: '18px',
                padding: '16px 18px',
                borderRadius: '14px',
                background: 'rgba(255,107,107,0.08)',
                border: '1px solid rgba(255,107,107,0.22)',
              },
            },
            React.createElement(
              'p',
              {
                style: {
                  color: '#FF9E9E',
                  fontSize: '13px',
                  fontWeight: '700',
                  marginBottom: '6px',
                },
              },
              a('video_error_title')
            ),
            React.createElement(
              'p',
              {
                style: {
                  color: 'rgba(245,240,232,0.72)',
                  fontSize: '12.5px',
                  lineHeight: 1.6,
                  marginBottom: '12px',
                },
              },
              a('video_error_body')
            ),
            I &&
              React.createElement(
                'p',
                {
                  style: {
                    color: 'rgba(245,240,232,0.38)',
                    fontSize: '11px',
                    marginBottom: '12px',
                  },
                },
                a('video_error_detail'),
                ': ',
                I
              ),
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                },
              },
              React.createElement(
                'button',
                {
                  onClick: () => {
                    (J('reload'), h(!1), k('loading'), f(null), m((w) => w + 1));
                  },
                  style: In(g, '#0A0A0A', {
                    width: 'auto',
                    minWidth: '190px',
                    padding: '12px 22px',
                    fontSize: '13px',
                  }),
                },
                a('video_error_reload')
              ),
              React.createElement(
                'button',
                {
                  onClick: () => {
                    (J('manual_unlock'),
                      h(!0),
                      ld.setVideoCompleted(V, t),
                      k('unlocked'),
                      f('manual_unlock'),
                      i && i(t, 'manual_unlock'));
                  },
                  style: Su({
                    color: 'rgba(245,240,232,0.78)',
                    borderColor: 'rgba(255,255,255,0.22)',
                  }),
                },
                a('video_error_unlock')
              )
            )
          ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              alignItems: 'center',
            },
          },
          React.createElement(
            'button',
            {
              onClick: l,
              disabled: !y,
              style: {
                ...In(g, '#0A0A0A', { width: '100%' }),
                opacity: y ? 1 : 0.35,
                cursor: y ? 'pointer' : 'not-allowed',
              },
            },
            d ? a('video_btn_final') : `${a('video_btn_next')} ${t + 1} →`
          ),
          t > 1 && React.createElement('button', { onClick: o, style: Su() }, a('video_btn_prev'))
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.2)',
              fontSize: '11px',
              marginTop: '14px',
              textAlign: 'center',
            },
          },
          y
            ? a('video_hint_unlocked')
            : S === 'error' || S === 'stalled'
              ? a('video_hint_recovery')
              : a('video_hint_locked')
        )
      )
    )
  );
}
function FinalStep({ profile: e, visible: t, onRestart: n }) {
  const [r, l] = React.useState(!1),
    o = e?.accentColor || '#C9A84C',
    i = React.useMemo(() => getCoachFromStorage() || {}, []),
    u = i?.phone || '',
    _s = i?.first_name || 'Markus',
    d = encodeURIComponent(a('final_whatsapp_prefill')),
    g = u ? `https://wa.me/${u.replace(/\D/g, '')}?text=${d}` : `https://wa.me/?text=${d}`;
  React.useEffect(() => {
    Dt('final_viewed', {
      quiz_profile: e?.code || '',
      quiz_profile_name: e?.name || '',
      final_viewed_at: new Date().toISOString(),
    });
  }, [e]);
  return r
    ? React.createElement(
        'div',
        { style: at },
        React.createElement(
          'div',
          { style: { ...ct(t), maxWidth: '480px', textAlign: 'center' } },
          React.createElement(
            'div',
            { style: { fontSize: '42px', marginBottom: '12px' } },
            '\u{1F44B}'
          ),
          React.createElement(
            'h2',
            { style: { ...dt(30, { marginBottom: '12px' }) } },
            a('final_closed_h2')
          ),
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.5)',
                fontSize: '14px',
                lineHeight: 1.7,
                marginBottom: '24px',
              },
            },
            a('final_closed_body')
          ),
          React.createElement(
            'button',
            {
              onClick: n,
              style: Su({ fontSize: '14px', padding: '12px 28px' }),
            },
            a('final_closed_restart')
          )
        )
      )
    : React.createElement(
        'div',
        { style: at },
        React.createElement(
          'div',
          { style: { ...ct(t), maxWidth: '600px', textAlign: 'center' } },
          React.createElement(
            'div',
            { style: { fontSize: '52px', marginBottom: '8px' } },
            '\u{1F3AF}'
          ),
          React.createElement('span', { style: Ot }, a('final_badge')),
          React.createElement(
            'h2',
            {
              style: { ...dt(40, { fontWeight: '700', marginBottom: '14px' }) },
            },
            a('final_h2')
          ),
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.58)',
                fontSize: '15px',
                lineHeight: 1.75,
                maxWidth: '440px',
                margin: '0 auto 26px',
              },
            },
            a('final_body')
          ),
          e &&
            React.createElement(
              'div',
              {
                style: {
                  background: e.accentSoft,
                  borderRadius: '16px',
                  padding: '18px 22px',
                  marginBottom: '28px',
                  border: `1px solid ${o}22`,
                },
              },
              React.createElement(
                'p',
                {
                  style: {
                    color: o,
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '5px',
                  },
                },
                e.emoji,
                ' ',
                a('final_profile_label'),
                ': ',
                e.name
              ),
              React.createElement(
                'p',
                {
                  style: {
                    color: 'rgba(245,240,232,0.52)',
                    fontSize: '13px',
                    fontStyle: 'italic',
                  },
                },
                e.cta
              )
            ),
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '11px',
                alignItems: 'center',
              },
            },
            React.createElement(
              'a',
              {
                href: g,
                target: '_blank',
                rel: 'noopener noreferrer',
                onClick: () => {
                  Dt('cta_click', {
                    cta_type: 'whatsapp',
                    cta_clicked_at: new Date().toISOString(),
                  });
                },
                style: {
                  ...In('#25D366', '#fff', {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    textDecoration: 'none',
                    width: '100%',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                  }),
                },
              },
              React.createElement('span', { style: { fontSize: '18px' } }, '\u{1F4AC}'),
              a('final_btn_whatsapp')
            ),
            React.createElement(
              'button',
              {
                onClick: () => {
                  (Dt('cta_click', {
                    cta_type: 'spaeter',
                    cta_clicked_at: new Date().toISOString(),
                  }),
                    l(!0));
                },
                style: Su({ width: '100%' }),
              },
              a('final_btn_later')
            )
          ),
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.18)',
                fontSize: '11.5px',
                marginTop: '16px',
              },
            },
            a('final_footnote')
          )
        )
      );
}
function LanguageSwitcher() {
  const activeLang = getPreferredLang(),
    e = (t, n) =>
      React.createElement(
        'button',
        {
          onClick: () => vu(t),
          style: {
            background: 'none',
            border: 'none',
            color: activeLang === t ? '#C9A84C' : 'rgba(245,240,232,0.38)',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: activeLang === t ? '700' : '500',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            transition: 'color 0.2s',
            padding: 0,
          },
          onMouseEnter: (r) => (r.currentTarget.style.color = '#C9A84C'),
          onMouseLeave: (r) =>
            (r.currentTarget.style.color = activeLang === t ? '#C9A84C' : 'rgba(245,240,232,0.38)'),
        },
        n
      );
  return React.createElement(
    'div',
    {
      id: 'langSwitcher',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '7px',
        flexWrap: 'wrap',
        marginTop: '8px',
        color: 'rgba(245,240,232,0.18)',
      },
    },
    e('de', 'DE'),
    React.createElement(
      'span',
      { style: { color: 'rgba(245,240,232,0.18)', fontSize: '10px' } },
      '-'
    ),
    e('it', 'IT'),
    React.createElement(
      'span',
      { style: { color: 'rgba(245,240,232,0.18)', fontSize: '10px' } },
      '-'
    ),
    e('fr', 'FR'),
    React.createElement(
      'span',
      { style: { color: 'rgba(245,240,232,0.18)', fontSize: '10px' } },
      '-'
    ),
    e('ru', 'RU'),
    React.createElement(
      'span',
      { style: { color: 'rgba(245,240,232,0.18)', fontSize: '10px' } },
      '-'
    ),
    e('en', 'EN')
  );
}
function QuickWhatsAppLink() {
  const e = React.useMemo(() => getCoachFromStorage(), []);
  if (!e || !e.phone) return null;
  const t = e.first_name || e.full_name || 'Coach',
    n = `${a('quicklink_whatsapp_prefix')}${t}${a('quicklink_whatsapp_suffix')}`,
    r = `https://wa.me/${e.phone.replace(/\D/g, '')}?text=${encodeURIComponent(n)}`;
  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: 'linear-gradient(to top, rgba(7,11,20,0.95), transparent)',
        backdropFilter: 'blur(10px)',
        padding: '16px 20px 18px',
        textAlign: 'center',
      },
    },
    React.createElement(
      'a',
      {
        href: r,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: {
          color: 'rgba(245,240,232,0.5)',
          fontSize: '13px',
          textDecoration: 'none',
          transition: 'color 0.2s',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
        },
        onMouseEnter: (r) => (r.currentTarget.style.color = 'rgba(245,240,232,0.8)'),
        onMouseLeave: (r) => (r.currentTarget.style.color = 'rgba(245,240,232,0.5)'),
      },
      React.createElement('span', { style: { fontSize: '14px' } }, '\u{1F4AC}'),
      React.createElement('span', null, a('final_contact_prompt'), ' ', t)
    )
  );
}
function QuizFlow() {
  const [e, t] = React.useState('intro'),
    [n, r] = React.useState(0),
    [l, o] = React.useState([]),
    [i, u] = React.useState(null),
    [s, d] = React.useState(!0),
    [g, y] = React.useState(null),
    [h, w] = React.useState('freedom'),
    [S, k] = React.useState(0),
    [I, f] = React.useState(null),
    [c, m] = React.useState(1),
    [resumeStartPercent, setResumeStartPercent] = React.useState(0),
    [resumeVideoStep, setResumeVideoStep] = React.useState(0),
    videoSteps = React.useMemo(() => Ap(), []),
    questions = React.useMemo(() => jp(), []),
    profiles = React.useMemo(() => Bp(), []),
    analyzingSteps = React.useMemo(() => Up(), []),
    coach = React.useMemo(
      () =>
        getCoachFromStorage() || {
          slug: le.getItem('acBeraterSlug') || 'default',
          member_id: le.getItem('acMemberId') || '',
        },
      []
    );
  React.useEffect(() => {
    if (document.querySelector('link[data-ac-fonts="quiz"]')) return;
    const L = document.createElement('link');
    ((L.rel = 'stylesheet'),
      (L.href = '/fonts/fonts.css'),
      L.setAttribute('data-ac-fonts', 'quiz'),
      document.head.appendChild(L));
  }, []);
  React.useEffect(() => {
    if (localStorage.getItem('acResumeFromLink') === 'true') {
      localStorage.removeItem('acResumeFromLink');
      const videoStep = parseInt(localStorage.getItem('acResumeVideoStep') || '1', 10);
      localStorage.removeItem('acResumeVideoStep');
      const resumeTarget = localStorage.getItem('acResumeTarget') || 'result';
      const storedResumeStartPercent = parseInt(
        localStorage.getItem('acResumeStartPercent') || '0',
        10
      );
      const resumeProfileCode = localStorage.getItem('acResumeProfileCode') || '';
      const resumeAspiration = localStorage.getItem('acResumeAspiration') || 'freedom';
      const resumeBarrier = localStorage.getItem('acResumeBarrier') || '';
      localStorage.removeItem('acResumeTarget');
      localStorage.removeItem('acResumeStartPercent');
      localStorage.removeItem('acResumeProfileCode');
      localStorage.removeItem('acResumeAspiration');
      localStorage.removeItem('acResumeBarrier');

      if (resumeProfileCode && profiles[resumeProfileCode]) {
        y(profiles[resumeProfileCode]);
      }
      w(resumeAspiration || 'freedom');
      if (resumeBarrier) {
        const restoredAnswers = [];
        restoredAnswers[5] = { barrier: resumeBarrier };
        o(restoredAnswers);
      }

      if (resumeTarget === 'videos') {
        const normalizedVideoStep =
          videoStep > 1 && videoStep <= Object.keys(videoSteps).length ? videoStep : 1;
        m(normalizedVideoStep);
        setResumeVideoStep(normalizedVideoStep);
        setResumeStartPercent(
          Number.isFinite(storedResumeStartPercent)
            ? Math.max(0, Math.min(90, storedResumeStartPercent))
            : 0
        );
        t('videos');
      } else {
        setResumeStartPercent(0);
        setResumeVideoStep(0);
        t('result');
      }
    }
  }, [profiles, videoSteps]);
  React.useEffect(() => {
    if (e !== 'quiz' || !questions[n]) return;
    Dt('question_viewed', {
      step_index: n + 1,
      question_index: n + 1,
      question_key: questions[n].id,
      question_phase: questions[n].phase,
      question_viewed_at: new Date().toISOString(),
    });
  }, [e, n, questions]);
  const v = (L) => {
      (d(!1),
        setTimeout(() => {
          (L(), d(!0));
        }, 350));
    },
    C = () => {
      if (!i) return;
      Dt('question_answered', {
        step_index: n + 1,
        question_index: n + 1,
        question_key: questions[n]?.id || n + 1,
        question_phase: questions[n]?.phase || '',
        answer_label: i.label || '',
        answer_type: i.type || '',
        answer_aspiration: i.aspiration || '',
        answer_barrier: i.barrier || '',
        answered_at: new Date().toISOString(),
      });
      const L = [...l, i];
      n === 3
        ? v(() => {
            (o(L), t('aspiration-confirm'), u(null));
            const j = i.aspiration || 'freedom';
            w(j);
          })
        : n < questions.length - 1
          ? v(() => {
              (o(L), r((j) => j + 1), u(null));
            })
          : v(() => {
              (o(L), t('analyzing'), z(L));
            });
    },
    z = (L) => {
      const j = { R: 0, Y: 0, G: 0, B: 0 };
      L.slice(0, 3).forEach((_) => {
        _.type && j[_.type]++;
      });
      const se = Object.entries(j).sort((_, P) => P[1] - _[1])[0][0],
        je = L[3]?.aspiration || L[4]?.aspiration || 'freedom';
      w(je);
      let Ft = 0,
        Xl = setInterval(() => {
          (Ft++,
            k(Ft),
            Ft >= analyzingSteps.length &&
              (clearInterval(Xl),
              setTimeout(() => {
                const _ = profiles[se];
                (y(_),
                  Dt('quiz_result', {
                    quiz_profile: se,
                    quiz_profile_name: _.name,
                    quiz_aspiration: je,
                    main_aspiration: je,
                    main_aspiration_label: getAspirationLabel(je),
                    quiz_barrier: L[5]?.barrier || '',
                    quiz_completed_at: new Date().toISOString(),
                  }),
                  v(() => t('optin')));
              }, 500)));
        }, 620);
    },
    N = () => {
      v(() => {
        resetRun(coach.slug || le.getItem('acBeraterSlug') || 'default', coach.member_id || '');
        (t('intro'), r(0), o([]), u(null), y(null), k(0), m(1), w('freedom'));
      });
    };
  if (e === 'intro')
    return React.createElement(
      'div',
      { style: at },
      React.createElement(
        'div',
        { style: { ...ct(s), textAlign: 'center' } },
        React.createElement(
          'div',
          { style: { fontSize: '58px', marginBottom: '4px' } },
          '\u{1F9EC}'
        ),
        React.createElement('span', { style: Ot }, a('intro_badge')),
        React.createElement(
          'h1',
          { style: { ...dt(50, { fontWeight: '700', marginBottom: '16px' }) } },
          a('intro_h1_line1'),
          React.createElement('br', null),
          React.createElement('em', { style: { color: '#C9A84C' } }, a('intro_h1_line2'))
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.58)',
              lineHeight: '1.78',
              fontSize: '15px',
              maxWidth: '460px',
              margin: '0 auto 26px',
            },
          },
          a('intro_body')
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              gap: '9px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '34px',
            },
          },
          [
            ['\u{1F525}', a('intro_type_1')],
            ['\u{1F4A8}', a('intro_type_2')],
            ['\u{1F30A}', a('intro_type_3')],
            ['\u{1FAA8}', a('intro_type_4')],
          ].map(([L, j]) =>
            React.createElement(
              'span',
              {
                key: j,
                style: {
                  padding: '6px 16px',
                  borderRadius: '100px',
                  background: 'rgba(201,168,76,0.07)',
                  border: '1px solid rgba(201,168,76,0.2)',
                  color: '#C9A84C',
                  fontSize: '13px',
                  fontWeight: '500',
                },
              },
              L,
              ' ',
              j
            )
          )
        ),
        React.createElement(
          'button',
          {
            onClick: () => {
              Dt('quiz_started', { quiz_started_at: new Date().toISOString() });
              v(() => t('quiz'));
            },
            style: In('#C9A84C'),
          },
          a('intro_cta')
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.22)',
              fontSize: '12px',
              marginTop: '14px',
            },
          },
          a('intro_disclaimer')
        ),
        React.createElement(
          'div',
          {
            style: {
              color: 'rgba(245,240,232,0.15)',
              fontSize: '11px',
              marginTop: '20px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(245,240,232,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            },
          },
          React.createElement(
            'a',
            {
              href: 'https://impressum.hl-support.biz/privacy.html',
              onClick: (L) => window.openLegalModal(L),
              style: {
                color: 'rgba(245,240,232,0.4)',
                textDecoration: 'none',
                transition: 'color 0.2s',
                cursor: 'pointer',
              },
              onMouseEnter: (L) => (L.target.style.color = 'rgba(245,240,232,0.6)'),
              onMouseLeave: (L) => (L.target.style.color = 'rgba(245,240,232,0.4)'),
            },
            a('intro_legal_link')
          ),
          React.createElement(LanguageSwitcher, null)
        )
      )
    );
  if (e === 'analyzing')
    return React.createElement(
      'div',
      { style: at },
      React.createElement(
        'div',
        { style: { ...ct(!0), textAlign: 'center' } },
        React.createElement(
          'div',
          { style: { fontSize: '52px', marginBottom: '22px' } },
          '\u2697\uFE0F'
        ),
        React.createElement('span', { style: Ot }, a('analyzing_badge')),
        React.createElement(
          'h2',
          { style: { ...dt(34, { marginBottom: '30px' }) } },
          a('analyzing_h2')
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '11px',
              maxWidth: '360px',
              margin: '0 auto 30px',
            },
          },
          analyzingSteps.map((L, j) =>
            React.createElement(
              'div',
              {
                key: j,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  opacity: S > j ? 1 : 0.18,
                  transition: 'opacity 0.45s ease',
                },
              },
              React.createElement(
                'span',
                {
                  style: {
                    fontSize: '15px',
                    color: S > j ? '#C9A84C' : 'rgba(245,240,232,0.3)',
                  },
                },
                S > j ? '\u2713' : '\u25CB'
              ),
              React.createElement(
                'span',
                {
                  style: {
                    color: S > j ? '#C9A84C' : 'rgba(245,240,232,0.35)',
                    fontSize: '14px',
                    textAlign: 'left',
                  },
                },
                L
              )
            )
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              height: '3px',
              background: 'rgba(201,168,76,0.1)',
              borderRadius: '100px',
              overflow: 'hidden',
              maxWidth: '280px',
              margin: '0 auto',
            },
          },
          React.createElement('div', {
            style: {
              height: '100%',
              background: 'linear-gradient(90deg,#C9A84C,#A8873E)',
              borderRadius: '100px',
              width: `${(S / analyzingSteps.length) * 100}%`,
              transition: 'width 0.6s ease',
            },
          })
        )
      )
    );
  if (e === 'result' && g) {
    const L = l[5],
      j = {
        vehicle: a('barrier_vehicle'),
        community: a('barrier_community'),
        confidence: a('barrier_confidence'),
        opportunity: a('barrier_opportunity'),
      },
      se = {
        freedom: a('asp_tag_freedom'),
        impact: a('asp_tag_impact'),
        security: a('asp_tag_security'),
        growth: a('asp_tag_growth'),
      },
      ae = [
        {
          number: '01',
          label: a('result_snapshot_type_label'),
          value: g.name,
        },
        {
          number: '02',
          label: a('result_snapshot_energy_label'),
          value: a(`result_snapshot_energy_${h}`),
        },
        {
          number: '03',
          label: a('result_snapshot_blocker_label'),
          value: L?.barrier ? j[L.barrier] : a('result_snapshot_blocker_fallback'),
        },
        {
          number: '04',
          label: a('result_snapshot_access_label'),
          value: a('result_snapshot_access_text'),
        },
      ];
    return React.createElement(
      'div',
      { style: at },
      React.createElement(
        'div',
        { style: { ...ct(s), maxWidth: '720px' } },
        React.createElement(
          'div',
          { style: { textAlign: 'center', marginBottom: '28px' } },
          React.createElement('span', { style: Ot }, g.code, ' \xB7 ', a('result_badge')),
          React.createElement('div', { style: { fontSize: '70px', marginBottom: '6px' } }, g.emoji),
          React.createElement(
            'h2',
            {
              style: {
                ...dt(46, { fontWeight: '700', marginBottom: '4px' }),
                color: g.accentColor,
              },
            },
            g.name
          ),
          React.createElement(
            'p',
            {
              style: {
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: 'clamp(15px,2.5vw,20px)',
                fontStyle: 'italic',
                color: 'rgba(245,240,232,0.65)',
              },
            },
            g.tagline
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              background: 'rgba(255,255,255,0.025)',
              border: `1px solid ${g.accentColor}24`,
              borderRadius: '16px',
              padding: '18px',
              marginBottom: '18px',
            },
          },
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.38)',
                fontSize: '10.5px',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
                marginBottom: '13px',
              },
            },
            a('result_snapshot_heading')
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '9px',
              },
            },
            ae.map((je) =>
              React.createElement(
                'div',
                {
                  key: je.number,
                  style: {
                    background: 'rgba(7,11,20,0.38)',
                    border: `1px solid ${g.accentColor}1F`,
                    borderRadius: '12px',
                    padding: '13px 14px',
                    minHeight: '82px',
                  },
                },
                React.createElement(
                  'div',
                  {
                    style: {
                      color: g.accentColor,
                      fontSize: '10px',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      marginBottom: '7px',
                    },
                  },
                  je.number
                ),
                React.createElement(
                  'p',
                  {
                    style: {
                      color: 'rgba(245,240,232,0.42)',
                      fontSize: '10.5px',
                      letterSpacing: '1.8px',
                      textTransform: 'uppercase',
                      marginBottom: '5px',
                    },
                  },
                  je.label
                ),
                React.createElement(
                  'p',
                  {
                    style: {
                      color: '#F5F0E8',
                      fontSize: '13.5px',
                      lineHeight: 1.45,
                      fontWeight: '600',
                      margin: 0,
                    },
                  },
                  je.value
                )
              )
            )
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '24px',
            },
          },
          React.createElement(
            'div',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '100px',
                background: g.accentSoft,
                border: `1px solid ${g.accentColor}33`,
              },
            },
            React.createElement('span', { style: { fontSize: '16px' } }, g.emoji),
            React.createElement(
              'span',
              {
                style: {
                  color: g.accentColor,
                  fontWeight: '600',
                  fontSize: '13.5px',
                },
              },
              a('result_element_label'),
              ': ',
              g.animal
            )
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '100px',
                background: g.accentSoft,
                border: `1px solid ${g.accentColor}33`,
              },
            },
            React.createElement(
              'span',
              {
                style: {
                  color: g.accentColor,
                  fontWeight: '600',
                  fontSize: '13.5px',
                },
              },
              se[h]
            )
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px',
              padding: '22px',
              marginBottom: '18px',
            },
          },
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.4)',
                fontSize: '10.5px',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
                marginBottom: '14px',
              },
            },
            a('result_strengths_heading')
          ),
          React.createElement(
            'div',
            {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              },
            },
            g.strengths.map((je, Ft) =>
              React.createElement(
                'div',
                {
                  key: Ft,
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  },
                },
                React.createElement(
                  'span',
                  {
                    style: {
                      color: g.accentColor,
                      fontSize: '12px',
                      marginTop: '3px',
                      flexShrink: 0,
                    },
                  },
                  '\u25C6'
                ),
                React.createElement(
                  'span',
                  {
                    style: {
                      color: 'rgba(245,240,232,0.78)',
                      fontSize: '13px',
                      lineHeight: 1.5,
                    },
                  },
                  je
                )
              )
            )
          )
        ),
        React.createElement(
          'div',
          {
            style: {
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '14px',
              padding: '18px 22px',
              marginBottom: '24px',
              borderLeft: `3px solid ${g.accentColor}44`,
            },
          },
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.35)',
                fontSize: '10.5px',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
                marginBottom: '7px',
              },
            },
            a('result_shadow_heading')
          ),
          React.createElement(
            'p',
            {
              style: {
                color: 'rgba(245,240,232,0.62)',
                fontSize: '13.5px',
                lineHeight: 1.65,
                fontStyle: 'italic',
              },
            },
            g.shadow
          )
        ),
        React.createElement('div', {
          style: {
            height: '1px',
            background: 'linear-gradient(90deg,transparent,rgba(201,168,76,0.25),transparent)',
            margin: '24px 0',
          },
        }),
        React.createElement(
          'p',
          {
            style: {
              fontFamily: "'Cormorant Garamond',serif",
              fontSize: 'clamp(18px,2.8vw,24px)',
              color: '#F5F0E8',
              lineHeight: 1.6,
              marginBottom: '8px',
              fontWeight: '600',
            },
          },
          g.fitMap[h] || g.fitMap.freedom
        ),
        L?.barrier &&
          React.createElement(
            'p',
            {
              style: {
                color: g.accentColor,
                fontSize: '13.5px',
                marginBottom: '20px',
                fontStyle: 'italic',
              },
            },
            a('result_barrier_intro'),
            j[L.barrier],
            a('result_barrier_outro')
          ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.52)',
              fontSize: '14.5px',
              lineHeight: 1.65,
              marginBottom: '14px',
            },
          },
          g.ctaMap[h] || g.ctaMap.freedom
        ),
        React.createElement(
          'p',
          {
            style: {
              color: g.accentColor,
              fontSize: '13.5px',
              lineHeight: 1.6,
              marginBottom: '18px',
              fontWeight: '600',
            },
          },
          a('result_video_access_note')
        ),
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '11px',
              alignItems: 'center',
            },
          },
          React.createElement(
            'button',
            {
              onClick: () => {
                Dt('result_cta_click', {
                  quiz_profile: g?.code || '',
                  quiz_profile_name: g?.name || '',
                  quiz_aspiration: h,
                  main_aspiration: h,
                  main_aspiration_label: getAspirationLabel(h),
                  result_cta_clicked_at: new Date().toISOString(),
                });
                v(() => t('videos'));
              },
              style: In(g.accentColor, '#0A0A0A', { width: '100%' }),
            },
            a('result_cta_btn')
          )
        )
      )
    );
  }
  if (e === 'aspiration-confirm') {
    const j = {
      freedom: {
        icon: '\u{1F54A}\uFE0F',
        label: a('aspconf_freedom_label'),
        desc: a('aspconf_freedom_desc'),
      },
      impact: {
        icon: '\u{1F331}',
        label: a('aspconf_impact_label'),
        desc: a('aspconf_impact_desc'),
      },
      security: {
        icon: '\u{1F3E0}',
        label: a('aspconf_security_label'),
        desc: a('aspconf_security_desc'),
      },
      growth: {
        icon: '\u{1F4C8}',
        label: a('aspconf_growth_label'),
        desc: a('aspconf_growth_desc'),
      },
    }[h];
    return React.createElement(
      'div',
      { style: at },
      React.createElement(
        'div',
        { style: { ...ct(s), maxWidth: '520px', textAlign: 'center' } },
        React.createElement('div', { style: { fontSize: '52px', marginBottom: '12px' } }, j?.icon),
        React.createElement('span', { style: Ot }, a('aspconf_badge')),
        React.createElement(
          'h2',
          {
            style: {
              ...dt(40, {
                fontWeight: '700',
                marginBottom: '8px',
                color: '#C9A84C',
              }),
            },
          },
          j?.label
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.62)',
              fontSize: '15px',
              lineHeight: 1.7,
              marginBottom: '32px',
            },
          },
          j?.desc
        ),
        React.createElement(
          'button',
          {
            onClick: () =>
              v(() => {
                Dt('aspiration_confirmed', {
                  quiz_aspiration: h,
                  main_aspiration: h,
                  main_aspiration_label: getAspirationLabel(h),
                  aspiration_confirmed_at: new Date().toISOString(),
                });
                (r((se) => se + 1), u(null), t('quiz'));
              }),
            style: In('#C9A84C', '#0A0A0A', { width: '100%' }),
          },
          a('aspconf_btn')
        ),
        React.createElement(
          'p',
          {
            style: {
              color: 'rgba(245,240,232,0.2)',
              fontSize: '11.5px',
              marginTop: '16px',
            },
          },
          a('aspconf_footnote')
        )
      )
    );
  }
  if (e === 'optin')
    return React.createElement(OptinStep, {
      profile: g,
      answers: l,
      berater: coach.slug || le.getItem('acBeraterSlug') || 'default',
      aspiration: h,
      visible: s,
      onSubmit: () => v(() => t('result')),
    });
  if (e === 'videos')
    return React.createElement(VideoStep, {
      profile: g,
      videoStep: c,
      videos: videoSteps,
      resumeStartPercent: c === resumeVideoStep ? resumeStartPercent : 0,
      visible: s,
      onVideoReached95: (completedStep, completionReason) => {
        const slug = le.getItem('acBeraterSlug') || 'default';
        const memberId = le.getItem('acMemberId') || '';
        sendVideoProgressWebhook(slug, memberId, completedStep, videoSteps, completionReason);
      },
      onVideoFullyCompleted: (completedStep) => {
        const slug = le.getItem('acBeraterSlug') || 'default';
        const memberId = le.getItem('acMemberId') || '';
        sendAllVideosCompletedCoachNotification(slug, memberId, completedStep, videoSteps);
      },
      onNext: () => {
        Dt('video_continue_click', {
          video_step: c,
          video_id: videoSteps[c]?.id || `quiz_video_${c}`,
          next_step: c < Object.keys(videoSteps).length ? c + 1 : 'final',
          video_continue_clicked_at: new Date().toISOString(),
        });
        c < Object.keys(videoSteps).length ? v(() => m((L) => L + 1)) : v(() => t('final'));
      },
      onPrev: () => v(() => m((L) => L - 1)),
    });
  if (e === 'final')
    return React.createElement(FinalStep, {
      profile: g,
      onRestart: N,
      visible: s,
    });
  const T = questions[n],
    V = ((n + 1) / questions.length) * 100,
    M = T.phase === 2,
    J = M ? '#74B9FF' : '#C9A84C';
  return React.createElement(
    'div',
    { style: at },
    React.createElement(
      'div',
      { style: { width: '100%', maxWidth: '680px', marginBottom: '14px' } },
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '7px',
          },
        },
        React.createElement(
          'span',
          {
            style: {
              color: J,
              fontSize: '10.5px',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
            },
          },
          a('quiz_phase'),
          ' ',
          T.phase,
          ' · ',
          T.phaseLabel
        ),
        React.createElement(
          'span',
          { style: { color: 'rgba(245,240,232,0.28)', fontSize: '12px' } },
          n + 1,
          ' / ',
          questions.length
        )
      ),
      React.createElement(
        'div',
        {
          style: {
            height: '3px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '100px',
            overflow: 'hidden',
          },
        },
        React.createElement('div', {
          style: {
            height: '100%',
            width: `${V}%`,
            background: M
              ? 'linear-gradient(90deg,#74B9FF,#4A90D9)'
              : 'linear-gradient(90deg,#C9A84C,#A8873E)',
            borderRadius: '100px',
            transition: 'width 0.5s ease',
          },
        })
      )
    ),
    React.createElement(
      'div',
      { style: ct(s) },
      React.createElement(
        'span',
        { style: { ...Ot, color: J } },
        a('quiz_question_label'),
        ' ',
        n + 1
      ),
      React.createElement(
        'h2',
        { style: { ...dt(32, { marginBottom: '7px', fontWeight: '600' }) } },
        T.text
      ),
      React.createElement(
        'p',
        {
          style: {
            color: 'rgba(245,240,232,0.42)',
            fontSize: '13px',
            marginBottom: '26px',
            fontStyle: 'italic',
          },
        },
        T.sub
      ),
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
            marginBottom: '26px',
          },
        },
        T.options.map((L, j) => {
          const se = i === L;
          return React.createElement(
            'button',
            {
              key: j,
              onClick: () => u(L),
              onMouseEnter: () => f(j),
              onMouseLeave: () => f(null),
              style: {
                background: se
                  ? M
                    ? 'rgba(116,185,255,0.09)'
                    : 'rgba(201,168,76,0.09)'
                  : I === j
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.022)',
                border: `1px solid ${se ? J : 'rgba(255,255,255,0.07)'}`,
                borderRadius: '14px',
                padding: '15px 18px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.18s ease',
                transform: se ? 'scale(1.008)' : 'scale(1)',
              },
            },
            React.createElement(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '13px' } },
              React.createElement(
                'div',
                {
                  style: {
                    width: '21px',
                    height: '21px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: `2px solid ${se ? J : 'rgba(255,255,255,0.14)'}`,
                    background: se ? J : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.18s ease',
                  },
                },
                se &&
                  React.createElement(
                    'span',
                    {
                      style: {
                        color: '#0A0A0A',
                        fontSize: '11px',
                        fontWeight: '700',
                      },
                    },
                    '\u2713'
                  )
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'p',
                  {
                    style: {
                      color: se ? J : '#F5F0E8',
                      fontWeight: '600',
                      fontSize: '14px',
                      marginBottom: '2px',
                      margin: 0,
                    },
                  },
                  L.label
                ),
                React.createElement(
                  'p',
                  {
                    style: {
                      color: 'rgba(245,240,232,0.48)',
                      fontSize: '12.5px',
                      lineHeight: 1.5,
                      margin: 0,
                    },
                  },
                  L.desc
                )
              )
            )
          );
        })
      ),
      React.createElement(
        'button',
        {
          onClick: C,
          disabled: !i,
          style: {
            background: i ? `linear-gradient(135deg,${J},${J}CC)` : 'rgba(255,255,255,0.06)',
            color: i ? '#0A0A0A' : 'rgba(245,240,232,0.25)',
            border: 'none',
            borderRadius: '100px',
            padding: '14px 0',
            fontSize: '15px',
            fontWeight: '600',
            cursor: i ? 'pointer' : 'not-allowed',
            width: '100%',
            transition: 'all 0.2s ease',
          },
        },
        n < questions.length - 1 ? a('quiz_btn_next') : a('quiz_btn_submit')
      )
    )
  );
}

function em() {
  const e = document.getElementById('legalModalTitle');
  e && (e.textContent = a('legal_modal_title'));
}
function tm(e) {
  e.preventDefault();
  const t = document.getElementById('legalModal'),
    n = document.getElementById('legalModalContent');
  (t.classList.remove('hidden'),
    t.offsetWidth,
    t.classList.remove('opacity-0'),
    n.classList.remove('scale-95'),
    (document.body.style.overflow = 'hidden'),
    em());
}
function sd() {
  const e = document.getElementById('legalModal'),
    t = document.getElementById('legalModalContent');
  (e.classList.add('opacity-0'),
    t.classList.add('scale-95'),
    setTimeout(() => {
      (e.classList.add('hidden'), (document.body.style.overflow = ''));
    }, 300));
}
export function QuizPage() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(QuizFlow, null),
    React.createElement(QuickWhatsAppLink, null)
  );
}

export function bindLegalModal() {
  window.openLegalModal = tm;
  window.closeLegalModal = sd;
  setTimeout(() => {
    const overlay = document.getElementById('legalModal');
    if (overlay) {
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          sd();
        }
      });
    }
  }, 100);
}
