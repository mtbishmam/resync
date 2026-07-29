"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "inbox" | "queued" | "watched";
type Topic = "Unsorted" | "AI" | "Development" | "Business" | "CP";
type ValueFactor = {
  label: string;
  points: number;
  max: number;
};

type Video = {
  id: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  url: string;
  title: string;
  channel: string;
  durationMinutes: number;
  topic: Topic;
  status: Status;
  valueScore: number;
  valueReason: string;
  valueFactors?: ValueFactor[];
  addedAt: number;
  cooldownUntil: number;
  progress: number;
  accent: string;
};

const STORAGE_KEY = "resync-replay-videos";
const LEGACY_STORAGE_KEY = "later-videos";
const NOTES_KEY = "resync-replay-notes";
const COOLDOWN_MINUTES = 20;

const starterVideos: Video[] = [
  {
    id: "v-1",
    url: "https://youtube.com/watch?v=ai-agents",
    title: "Building AI agents that actually finish the job",
    channel: "Matthew Berman",
    durationMinutes: 18,
    topic: "AI",
    status: "queued",
    valueScore: 94,
    valueReason: "Directly useful for your AI app",
    valueFactors: [
      { label: "Goal relevance", points: 34, max: 35 },
      { label: "Mentor fit", points: 15, max: 15 },
      { label: "Actionability", points: 14, max: 15 },
      { label: "Novelty", points: 9, max: 10 },
      { label: "Information density", points: 9, max: 10 },
      { label: "Time efficiency", points: 9, max: 10 },
      { label: "Timeliness", points: 4, max: 5 },
    ],
    addedAt: Date.now() - 1000 * 60 * 26,
    cooldownUntil: 0,
    progress: 0,
    accent: "violet",
  },
  {
    id: "v-2",
    url: "https://youtube.com/watch?v=fast-web-apps",
    title: "Why your web app feels slow",
    channel: "Theo",
    durationMinutes: 24,
    topic: "Development",
    status: "inbox",
    valueScore: 89,
    valueReason: "High relevance to perceived speed",
    valueFactors: [
      { label: "Goal relevance", points: 33, max: 35 },
      { label: "Mentor fit", points: 14, max: 15 },
      { label: "Actionability", points: 14, max: 15 },
      { label: "Novelty", points: 8, max: 10 },
      { label: "Information density", points: 8, max: 10 },
      { label: "Time efficiency", points: 8, max: 10 },
      { label: "Timeliness", points: 4, max: 5 },
    ],
    addedAt: Date.now() - 1000 * 60 * 60 * 3,
    cooldownUntil: 0,
    progress: 0,
    accent: "blue",
  },
  {
    id: "v-3",
    url: "https://youtube.com/watch?v=offers",
    title: "The fastest way to make an offer better",
    channel: "Alex Hormozi",
    durationMinutes: 12,
    topic: "Business",
    status: "queued",
    valueScore: 83,
    valueReason: "Short, practical, immediately actionable",
    valueFactors: [
      { label: "Goal relevance", points: 29, max: 35 },
      { label: "Mentor fit", points: 15, max: 15 },
      { label: "Actionability", points: 15, max: 15 },
      { label: "Novelty", points: 7, max: 10 },
      { label: "Information density", points: 7, max: 10 },
      { label: "Time efficiency", points: 8, max: 10 },
      { label: "Timeliness", points: 2, max: 5 },
    ],
    addedAt: Date.now() - 1000 * 60 * 60 * 8,
    cooldownUntil: 0,
    progress: 42,
    accent: "amber",
  },
  {
    id: "v-4",
    url: "https://youtube.com/watch?v=cp-thinking",
    title: "How strong programmers think through hard problems",
    channel: "Competitive Programming",
    durationMinutes: 31,
    topic: "CP",
    status: "watched",
    valueScore: 78,
    valueReason: "Supports deliberate problem-solving practice",
    valueFactors: [
      { label: "Goal relevance", points: 31, max: 35 },
      { label: "Mentor fit", points: 8, max: 15 },
      { label: "Actionability", points: 13, max: 15 },
      { label: "Novelty", points: 7, max: 10 },
      { label: "Information density", points: 8, max: 10 },
      { label: "Time efficiency", points: 7, max: 10 },
      { label: "Timeliness", points: 4, max: 5 },
    ],
    addedAt: Date.now() - 1000 * 60 * 60 * 24,
    cooldownUntil: 0,
    progress: 100,
    accent: "green",
  },
];

const topics: Array<"All" | Topic> = [
  "All",
  "Unsorted",
  "AI",
  "Development",
  "Business",
  "CP",
];

function getYouTubeId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      return url.searchParams.get("v") ?? undefined;
    }
  } catch {
    return undefined;
  }
}

function relativeTime(timestamp: number, now: number) {
  const minutes = Math.max(1, Math.round((now - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function countdown(until: number, now: number) {
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function normalizeVideo(video: Partial<Video>): Video {
  const validTopics: Topic[] = ["Unsorted", "AI", "Development", "Business", "CP"];
  const starterMatch = starterVideos.find((item) => item.id === video.id);
  return {
    id: video.id ?? crypto.randomUUID(),
    youtubeId: video.youtubeId,
    thumbnailUrl: video.thumbnailUrl,
    url: video.url ?? "",
    title: video.title ?? "Saved YouTube video",
    channel: video.channel ?? "Metadata unavailable",
    durationMinutes: video.durationMinutes ?? 0,
    topic: validTopics.includes(video.topic as Topic)
      ? (video.topic as Topic)
      : "Unsorted",
    status: video.status ?? "inbox",
    valueScore: video.valueScore ?? 0,
    valueReason: video.valueReason ?? "AI analysis pending",
    valueFactors: video.valueFactors ?? starterMatch?.valueFactors,
    addedAt: video.addedAt ?? Date.now(),
    cooldownUntil: video.cooldownUntil ?? 0,
    progress: video.progress ?? 0,
    accent: video.accent ?? "red",
  };
}

export default function Home() {
  const [videos, setVideos] = useState<Video[]>(starterVideos);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [activeStatus, setActiveStatus] = useState<Status | "all">("all");
  const [activeTopic, setActiveTopic] = useState<"All" | Topic>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<Video | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    window.queueMicrotask(() => {
      const saved =
        window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        try {
          setVideos((JSON.parse(saved) as Partial<Video>[]).map(normalizeVideo));
        } catch {
          setVideos(starterVideos);
        }
      }
      const savedNotes = window.localStorage.getItem(NOTES_KEY);
      if (savedNotes) {
        try {
          setNotes(JSON.parse(savedNotes));
        } catch {
          setNotes({});
        }
      }
      setNow(Date.now());
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }, [ready, videos]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes, ready]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);

  const selectedVideo = videos.find((video) => video.id === selectedId) ?? null;

  const counts = useMemo(
    () => ({
      all: videos.length,
      inbox: videos.filter((video) => video.status === "inbox").length,
      queued: videos.filter((video) => video.status === "queued").length,
      watched: videos.filter((video) => video.status === "watched").length,
    }),
    [videos],
  );

  const visibleVideos = useMemo(() => {
    const result = videos.filter((video) => {
      const matchesStatus = activeStatus === "all" || video.status === activeStatus;
      const matchesTopic = activeTopic === "All" || video.topic === activeTopic;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        video.title.toLowerCase().includes(query) ||
        video.channel.toLowerCase().includes(query);
      return matchesStatus && matchesTopic && matchesSearch;
    });

    return result.sort((a, b) => {
      if (sort === "newest") return b.addedAt - a.addedAt;
      if (sort === "shortest") return a.durationMinutes - b.durationMinutes;
      return b.valueScore - a.valueScore;
    });
  }, [activeStatus, activeTopic, search, sort, videos]);

  const totalMinutes = visibleVideos.reduce(
    (sum, video) => sum + video.durationMinutes,
    0,
  );

  async function enrichMetadata(id: string, videoUrl: string) {
    try {
      const response = await fetch(`/api/youtube?url=${encodeURIComponent(videoUrl)}`);
      if (!response.ok) throw new Error("Metadata request failed");
      const metadata = (await response.json()) as {
        title: string;
        channel: string;
        thumbnailUrl?: string;
      };
      setVideos((current) =>
        current.map((video) =>
          video.id === id
            ? {
                ...video,
                title: metadata.title,
                channel: metadata.channel,
                thumbnailUrl: metadata.thumbnailUrl,
              }
            : video,
        ),
      );
      setNotice(`Saved and identified. ${COOLDOWN_MINUTES}-minute cooldown active.`);
    } catch {
      setVideos((current) =>
        current.map((video) =>
          video.id === id
            ? { ...video, channel: "Metadata unavailable — link is still saved" }
            : video,
        ),
      );
      setNotice("Saved. YouTube metadata could not be loaded for this link.");
    }
  }

  function addVideo(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    const youtubeId = getYouTubeId(value);

    if (!youtubeId) {
      setNotice("Paste a valid YouTube video link.");
      return;
    }

    if (videos.some((video) => video.youtubeId === youtubeId || video.url === value)) {
      setNotice("Already in RePlay — no duplicate added.");
      return;
    }

    const addedAt = Date.now();
    const newVideo: Video = {
      id: crypto.randomUUID(),
      youtubeId,
      url: value,
      title: "Fetching video details…",
      channel: "YouTube",
      durationMinutes: 0,
      topic: "Unsorted",
      status: "inbox",
      valueScore: 0,
      valueReason: "AI analysis pending",
      addedAt,
      cooldownUntil: addedAt + COOLDOWN_MINUTES * 60 * 1000,
      progress: 0,
      accent: "red",
    };

    setVideos((current) => [newVideo, ...current]);
    setUrl("");
    setNotice("Saved instantly. Fetching title and channel…");
    void enrichMetadata(newVideo.id, value);
  }

  function changeStatus(id: string, status: Status) {
    setVideos((current) =>
      current.map((video) =>
        video.id === id
          ? { ...video, status, progress: status === "watched" ? 100 : video.progress }
          : video,
      ),
    );
  }

  function removeVideo(video: Video) {
    setVideos((current) => current.filter((item) => item.id !== video.id));
    setLastRemoved(video);
    if (selectedId === video.id) setSelectedId(null);
    setNotice("Video removed from RePlay.");
  }

  function undoRemove() {
    if (!lastRemoved) return;
    setVideos((current) => [lastRemoved, ...current]);
    setLastRemoved(null);
    setNotice("Video restored.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="ReSync home">
          <span className="brand-mark">R</span>
          <span>ReSync</span>
        </a>

        <p className="sidebar-label page-label">Library</p>
        <nav className="primary-nav" aria-label="RePlay sections">
          {[
            ["all", "RePlay"],
            ["inbox", "Inbox"],
            ["queued", "Queue"],
            ["watched", "Watched"],
          ].map(([key, label]) => (
            <button
              className={activeStatus === key ? "nav-item active" : "nav-item"}
              key={key}
              onClick={() => setActiveStatus(key as Status | "all")}
            >
              <span>{label}</span>
              <span className="nav-count">{counts[key as keyof typeof counts]}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <p className="sidebar-label">Topics</p>
        <div className="topic-nav">
          {topics.slice(1).map((topic) => (
            <button
              key={topic}
              className={activeTopic === topic ? "topic-link active" : "topic-link"}
              onClick={() => setActiveTopic(topic)}
            >
              <span className={`topic-dot ${topic.toLowerCase()}`} />
              {topic}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="storage-line">
            <span>Saved on this device</span>
            <span>{videos.length} videos</span>
          </div>
          <div className="storage-track">
            <span style={{ width: `${Math.min(100, videos.length * 7)}%` }} />
          </div>
          <p>Cloud sync arrives with the backend.</p>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">ReSync / RePlay</p>
            <h1>Save the urge. Watch with intention.</h1>
            <p className="intro-copy">
              A calmer watch-later library that gives every new video room to cool down.
            </p>
          </div>
          <div className="profile">MT</div>
        </header>

        <section className="capture-panel" aria-label="Add a video">
          <form onSubmit={addVideo}>
            <div className="capture-icon">↗</div>
            <label className="sr-only" htmlFor="video-url">
              YouTube video URL
            </label>
            <input
              id="video-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setNotice("");
              }}
              placeholder="Paste a YouTube link…"
              inputMode="url"
              autoComplete="off"
            />
            <span className="paste-hint">⌘ V</span>
            <button type="submit">Save to RePlay</button>
          </form>
          <div className="capture-meta">
            <span className="status-light" />
            <span>
              {notice ||
                `Title and channel load now · ${COOLDOWN_MINUTES}-minute watch cooldown`}
            </span>
          </div>
        </section>

        <section className="library-toolbar">
          <div className="topic-filters" aria-label="Filter by topic">
            {topics.map((topic) => (
              <button
                key={topic}
                className={activeTopic === topic ? "filter-chip active" : "filter-chip"}
                onClick={() => setActiveTopic(topic)}
              >
                {topic}
              </button>
            ))}
          </div>

          <div className="toolbar-actions">
            <label className="search-field">
              <span>⌕</span>
              <span className="sr-only">Search videos</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
              />
            </label>
            <select
              aria-label="Sort videos"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="value">Highest value</option>
              <option value="newest">Newest added</option>
              <option value="shortest">Shortest first</option>
            </select>
            <div className="view-toggle" aria-label="Change view">
              <button
                aria-label="Grid view"
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
              >
                ▦
              </button>
              <button
                aria-label="List view"
                className={view === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                ≡
              </button>
            </div>
          </div>
        </section>

        <div className="library-summary">
          <p>
            <strong>{visibleVideos.length}</strong> videos
            <span>·</span>
            <strong>
              {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
            </strong>
            <span>in this view</span>
          </p>
          <p>Prototype scores are shown transparently. AI is not connected yet.</p>
        </div>

        <section className={`video-library ${view}`}>
          {visibleVideos.map((video, index) => {
            const isCooling = now > 0 && video.cooldownUntil > now;
            const imageUrl =
              video.thumbnailUrl ??
              (video.youtubeId
                ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
                : undefined);
            return (
              <article className="video-card" key={video.id}>
                <button
                  className={`video-thumb ${video.accent}`}
                  onClick={() => setSelectedId(video.id)}
                  aria-label={`Open ${video.title} in RePlay`}
                  style={
                    imageUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(10, 13, 20, .82)), url("${imageUrl}")`,
                        }
                      : undefined
                  }
                >
                  <span className="rank">#{index + 1}</span>
                  {isCooling ? (
                    <span className="cooldown-pill">Cooling · {countdown(video.cooldownUntil, now)}</span>
                  ) : null}
                  <span className={isCooling ? "play-button locked" : "play-button"}>
                    {isCooling ? "◷" : "▶"}
                  </span>
                  <span className="duration">
                    {video.durationMinutes ? `${video.durationMinutes} min` : "duration pending"}
                  </span>
                  {video.progress > 0 && video.progress < 100 ? (
                    <span className="progress" style={{ width: `${video.progress}%` }} />
                  ) : null}
                </button>

                <div className="card-content">
                  <div className="card-topline">
                    <span className="topic-badge">{video.topic}</span>
                    <span className="added-time">
                      {relativeTime(video.addedAt, now || video.addedAt + 60000)}
                    </span>
                  </div>
                  <button className="title-button" onClick={() => setSelectedId(video.id)}>
                    <h2>{video.title}</h2>
                  </button>
                  <p className="channel">{video.channel}</p>
                  <div className="value-row">
                    <span className={video.valueScore ? "value-score" : "value-score pending"}>
                      {video.valueScore ? `${video.valueScore}` : "—"}
                    </span>
                    <span>
                      <strong>
                        {video.valueScore ? "Prototype value score" : "AI analysis pending"}
                      </strong>
                      {video.valueReason}
                    </span>
                  </div>
                  <div className="card-actions">
                    {video.status === "watched" ? (
                      <button
                        className="secondary-action"
                        onClick={() => changeStatus(video.id, "queued")}
                      >
                        Watched ✓
                      </button>
                    ) : (
                      <button
                        className="primary-action"
                        onClick={() => changeStatus(video.id, "queued")}
                      >
                        {video.status === "queued" ? "In queue" : "Add to queue"}
                      </button>
                    )}
                    <button
                      className="icon-action"
                      aria-label={`Mark ${video.title} watched`}
                      onClick={() => changeStatus(video.id, "watched")}
                    >
                      ✓
                    </button>
                    <button
                      className="icon-action remove"
                      aria-label={`Remove ${video.title}`}
                      onClick={() => removeVideo(video)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {visibleVideos.length === 0 ? (
          <section className="empty-state">
            <span>0</span>
            <h2>Nothing matches this view.</h2>
            <p>Try another topic or paste a YouTube link above.</p>
          </section>
        ) : null}
      </section>

      {lastRemoved ? (
        <div className="undo-toast" role="status">
          <span>Video removed</span>
          <button onClick={undoRemove}>Undo</button>
          <button aria-label="Dismiss" onClick={() => setLastRemoved(null)}>
            ×
          </button>
        </div>
      ) : null}

      {selectedVideo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}>
          <section
            className="replay-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedVideo.title} RePlay workspace`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close RePlay workspace"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
            <div className="player-column">
              <div className="player-stage">
                {selectedVideo.cooldownUntil > now ? (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock">◷</span>
                    <p className="eyebrow">Impulse buffer</p>
                    <h2>{countdown(selectedVideo.cooldownUntil, now)}</h2>
                    <p>
                      The video is saved, but not watchable yet. If the urge passes,
                      remove it. If the value remains, it will unlock automatically.
                    </p>
                    <button onClick={() => removeVideo(selectedVideo)}>
                      I don&apos;t need this video
                    </button>
                  </div>
                ) : selectedVideo.youtubeId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${selectedVideo.youtubeId}?rel=0`}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock">↗</span>
                    <h2>Preview card</h2>
                    <p>
                      Paste a real YouTube link to test the embedded RePlay player.
                    </p>
                  </div>
                )}
              </div>
              <div className="player-details">
                <div>
                  <span className="topic-badge">{selectedVideo.topic}</span>
                  <h2>{selectedVideo.title}</h2>
                  <p>{selectedVideo.channel}</p>
                </div>
                <a href={selectedVideo.url} target="_blank" rel="noreferrer">
                  Open on YouTube ↗
                </a>
              </div>
            </div>

            <aside className="ai-column">
              <header className="ai-header">
                <div>
                  <p className="eyebrow">RePlay AI</p>
                  <h2>Think while you watch.</h2>
                </div>
                <span className="prototype-chip">API later</span>
              </header>

              <section className="score-panel">
                <div className="score-heading">
                  <div>
                    <span>Personal value</span>
                    <strong>
                      {selectedVideo.valueScore ? selectedVideo.valueScore : "—"}
                      <small>/100</small>
                    </strong>
                  </div>
                  <p>
                    {selectedVideo.valueScore
                      ? "Demo score — these factors are currently hand-authored."
                      : "Waiting for metadata, goals, and AI analysis."}
                  </p>
                </div>
                {selectedVideo.valueFactors ? (
                  <div className="factor-list">
                    {selectedVideo.valueFactors.map((factor) => (
                      <div className="factor-row" key={factor.label}>
                        <span>{factor.label}</span>
                        <span className="factor-track">
                          <span style={{ width: `${(factor.points / factor.max) * 100}%` }} />
                        </span>
                        <strong>
                          {factor.points}/{factor.max}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="analysis-empty">
                    AI will assign evidence-backed factors and topic confidence here.
                  </div>
                )}
              </section>

              <section className="notes-panel">
                <div className="section-title">
                  <h3>Working notes</h3>
                  <span>saved locally</span>
                </div>
                <textarea
                  value={notes[selectedVideo.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [selectedVideo.id]: event.target.value,
                    }))
                  }
                  placeholder="Key ideas, timestamps, decisions, next actions…"
                />
              </section>

              <section className="ask-panel">
                <div className="ask-preview">
                  <span>✦</span>
                  <p>
                    Ask for the highest-value ideas, challenge a claim, or turn your
                    notes into actions.
                  </p>
                </div>
                <div className="ask-input">
                  <input
                    aria-label="Ask RePlay AI"
                    placeholder="Ask about this video…"
                    disabled
                  />
                  <button disabled>↑</button>
                </div>
                <p>Chat activates when the OpenAI backend is connected.</p>
              </section>

              <button className="modal-remove" onClick={() => removeVideo(selectedVideo)}>
                Remove from RePlay
              </button>
            </aside>
          </section>
        </div>
      ) : null}
    </main>
  );
}
