/**
 * Die Video-Engine des Funnels — Etappe E2 des Maschine/Template-Plans.
 *
 * Wortgleich aus src/app/App.jsx uebernommen (dort hiess sie nach der
 * Minifizierung `qp`): playerjs-Bindung, unique-Sekunden-Zaehlung, Anti-Seek,
 * 95-%-Freischaltung, Gesundheits- und Fortschrittsereignisse. Das Template
 * liefert nur die iframe-ID und rendert die gemeldeten Zustaende
 * ('loading'|'ready'|'tracking'|'unlocked'|'error'|'stalled').
 *
 * 🔴 Verhaltensvertrag: Aenderungen an Schwellen, Ereignissen oder dem
 * Anti-Seek sind Fachaenderungen mit eigenem PR. Die Ereignis-Matrix (E0b)
 * und der video-unlock-Quelltextvertrag in scripts/verify.js halten es fest.
 */
/* eslint-disable prefer-const -- wortgleicher Umzug aus App.jsx (dort galt
   dieselbe Ausnahme); die Aufraeumung der let-Ketten ist E4-Arbeit. */
import { trackQuizAnalytics as Dt } from '../lib/core.js';

export function bindeVideoTracking(iframeId, videoStep, onUnlocked, onStatus, options = {}) {
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
    programmaticSeekUntil = 0,
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

  function setPlayerTime(player, second, issue) {
    try {
      programmaticSeekUntil = Date.now() + 1200;
      player.setCurrentTime(second);
    } catch {
      trackHealth(issue || 'set_time_failed', String(second));
    }
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
      Math.min(
        Math.floor((duration * resumeStartPercent) / 100),
        Math.max(0, Math.floor(duration - 3))
      )
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
    setPlayerTime(player, startSecond, 'resume_seek_failed');
  }

  function seekBack(player, attemptedSecond) {
    const allowed = Math.max(0, Math.min(maxAllowedSecond, duration || maxAllowedSecond));
    seekCount += 1;
    track('video_seeked', {
      attempted_second: Math.floor(attemptedSecond || 0),
      allowed_second: Math.floor(allowed),
      seek_count: seekCount,
    });
    setPlayerTime(player, allowed, 'seekback_failed');
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
      if (Date.now() < programmaticSeekUntil) {
        lastSecond = Math.min(current, maxAllowedSecond || current);
        return;
      }
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
      const percent = uniqueWatchedPercent(),
        completedPayload = buildProgressPayload('playerjs_ended', 100);
      if (percent >= 95) {
        track('video_completed', completedPayload);
        if (options.onCompleted) options.onCompleted(videoStep, completedPayload);
      } else {
        track('video_ended_low_watch', {
          ...completedPayload,
          video_issue: 'ended_before_unique_watch_threshold',
          required_unique_watched_percent: 95,
        });
        setStatus('stalled', 'ended_before_unique_watch_threshold');
      }
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
