"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Status = "inbox" | "queued" | "watched";
type Topic = "AI" | "Development" | "Business" | "CP";

type Video = {
  id: string;
  youtubeId?: string;
  url: string;
  title: string;
  channel: string;
  durationMinutes: number;
  topic: Topic;
  status: Status;
  valueScore: number;
  valueReason: string;
  addedAt: number;
  progress: number;
  accent: string;
};

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
    addedAt: Date.now() - 1000 * 60 * 26,
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
    addedAt: Date.now() - 1000 * 60 * 60 * 3,
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
    addedAt: Date.now() - 1000 * 60 * 60 * 8,
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
    addedAt: Date.now() - 1000 * 60 * 60 * 24,
    progress: 100,
    accent: "green",
  },
];

const topics: Array<"All" | Topic> = [
  "All",
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

function relativeTime(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function Home() {
  const [videos, setVideos] = useState<Video[]>(starterVideos);
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [activeStatus, setActiveStatus] = useState<Status | "all">("all");
  const [activeTopic, setActiveTopic] = useState<"All" | Topic>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const saved = window.localStorage.getItem("later-videos");
    if (saved) {
      try {
        setVideos(JSON.parse(saved));
      } catch {
        setVideos(starterVideos);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem("later-videos", JSON.stringify(videos));
  }, [ready, videos]);

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

  function addVideo(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    const youtubeId = getYouTubeId(value);

    if (!youtubeId) {
      setNotice("Paste a valid YouTube video link.");
      return;
    }

    if (videos.some((video) => video.youtubeId === youtubeId || video.url === value)) {
      setNotice("Already in your library — no duplicate added.");
      return;
    }

    const newVideo: Video = {
      id: crypto.randomUUID(),
      youtubeId,
      url: value,
      title: "New YouTube video",
      channel: "Fetching metadata…",
      durationMinutes: 0,
      topic: "AI",
      status: "inbox",
      valueScore: 0,
      valueReason: "Saved instantly · analysis pending",
      addedAt: Date.now(),
      progress: 0,
      accent: "red",
    };

    setVideos((current) => [newVideo, ...current]);
    setUrl("");
    setNotice("Saved. Metadata can load in the background later.");
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Later home">
          <span className="brand-mark">L</span>
          <span>Later</span>
        </a>

        <nav className="primary-nav" aria-label="Library sections">
          {[
            ["all", "Library"],
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
            <p className="eyebrow">Personal watch later</p>
            <h1>Turn saved videos into a useful queue.</h1>
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
            <button type="submit">Save video</button>
          </form>
          <div className="capture-meta">
            <span className="status-light" />
            <span>{notice || "Instant save now. Automatic metadata later."}</span>
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
            <strong>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</strong>
            <span>in this view</span>
          </p>
          <p>Ranked for usefulness, not recency.</p>
        </div>

        <section className={`video-library ${view}`}>
          {visibleVideos.map((video, index) => (
            <article className="video-card" key={video.id}>
              <a
                className={`video-thumb ${video.accent}`}
                href={video.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${video.title} on YouTube`}
                style={
                  video.youtubeId
                    ? {
                        backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(10, 13, 20, .86)), url(https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg)`,
                      }
                    : undefined
                }
              >
                <span className="rank">#{index + 1}</span>
                <span className="play-button">▶</span>
                <span className="duration">
                  {video.durationMinutes ? `${video.durationMinutes} min` : "pending"}
                </span>
                {video.progress > 0 && video.progress < 100 ? (
                  <span className="progress" style={{ width: `${video.progress}%` }} />
                ) : null}
              </a>

              <div className="card-content">
                <div className="card-topline">
                  <span className="topic-badge">{video.topic}</span>
                  <span className="added-time">{relativeTime(video.addedAt)}</span>
                </div>
                <h2>{video.title}</h2>
                <p className="channel">{video.channel}</p>
                <div className="value-row">
                  <span className="value-score">
                    {video.valueScore ? `${video.valueScore}` : "—"}
                  </span>
                  <span>
                    <strong>{video.valueScore ? "High-value match" : "Not scored yet"}</strong>
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
                </div>
              </div>
            </article>
          ))}
        </section>

        {visibleVideos.length === 0 ? (
          <section className="empty-state">
            <span>0</span>
            <h2>Nothing matches this view.</h2>
            <p>Try another topic or paste a YouTube link above.</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
