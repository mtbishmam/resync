"use client";

import {
  CSSProperties,
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Status = "feed" | "inbox" | "queued" | "watched";
type ContentType = "Watch" | "Read";
type Topic = "AI" | "CP" | "Tech" | "Business";
type CloudStatus = "connecting" | "syncing" | "synced" | "offline";
type TranscriptStatus = "pending" | "available" | "unavailable" | "error";
type AnalysisStatus = "pending" | "complete" | "unavailable" | "error";
type ValueFactor = {
  label: string;
  points: number;
  max: number;
};

type AnalysisApiResult = {
  status?: string;
  message?: string;
  error?: string;
  transcriptStatus?: TranscriptStatus;
  analysisStatus?: AnalysisStatus;
  analysis?: {
    type?: ContentType;
    topics?: Topic[];
    recommendation?: "watch" | "skim" | "summary_only";
    summary_markdown?: string;
    rationale_markdown?: string;
    learnable_points?: Array<{
      title: string;
      detail: string;
      timestamp_seconds: number | null;
    }>;
    value_score?: number;
    value_reason?: string;
    valueFactors?: ValueFactor[];
  };
};

type AnalysisDetail = {
  summary: string;
  rationale: string;
  recommendation: "watch" | "skim" | "summary_only";
  learnablePoints: Array<{
    title: string;
    detail: string;
    timestampSeconds: number | null;
  }>;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type KnowledgeSummary = {
  summary: string;
  noteHash: string;
  topics: string[];
  model: string;
  updatedAt: number;
};

type UsageEvent = {
  id: string;
  item_id: string;
  purpose: "analysis" | "chat" | "knowledge" | "transcription";
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  audio_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_micros: number | null;
  created_at: number;
};

type ModelConfig = {
  text: string;
  transcription: string;
};

type ExtensionCapture = {
  captureId?: string;
  url?: string;
  title?: string;
  author?: string;
  content?: string;
};

type Video = {
  id: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  description?: string;
  publishedAt?: string | null;
  tags?: string[];
  captionAvailable?: boolean | null;
  metadataComplete?: boolean;
  transcriptStatus?: TranscriptStatus;
  analysisStatus?: AnalysisStatus;
  url: string;
  title: string;
  channel: string;
  durationMinutes: number;
  durationSeconds?: number;
  type: ContentType;
  topics: Topic[];
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
const SIDEBAR_WIDTH_KEY = "resync-sidebar-width";
const CLOUD_SYNCED_KEY = "resync-cloud-synced";
const CLOUD_DIRTY_KEY = "resync-cloud-dirty";
const CAPTURE_BROADCAST_CHANNEL = "resync-capture-results";
// Five minutes keeps the cooldown easy to test. The final ReSync release uses 24 hours.
const COOLDOWN_MINUTES = 5;
const topicOptions: Topic[] = ["AI", "CP", "Tech", "Business"];
const topics: Array<"All" | Topic> = ["All", ...topicOptions];

const starterVideos: Video[] = [
  {
    id: "v-1",
    url: "https://youtube.com/watch?v=ai-agents",
    title: "Building AI agents that actually finish the job",
    channel: "Matthew Berman",
    durationMinutes: 18,
    type: "Watch",
    topics: ["AI"],
    status: "feed",
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
    type: "Watch",
    topics: ["Tech"],
    status: "feed",
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
    type: "Watch",
    topics: ["Business"],
    status: "feed",
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
    type: "Watch",
    topics: ["CP"],
    status: "feed",
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

function getYouTubeId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null | undefined;
    if (hostname === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0];
    } else if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (
        url.pathname.startsWith("/shorts/") ||
        url.pathname.startsWith("/embed/") ||
        url.pathname.startsWith("/live/")
      ) {
        candidate = url.pathname.split("/").filter(Boolean)[1];
      } else if (url.pathname === "/watch") {
        candidate = url.searchParams.get("v");
      }
    }
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}

function getWebUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function isYouTubeUrl(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
}

function articleDetails(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "");
  const slug = url.pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "");
  const title = slug
    ? slug.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : `Article from ${hostname}`;
  return { title, channel: hostname };
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

function renderInlineMarkdown(value: string): ReactNode[] {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  return value.split(pattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

function normalizeAssistantMarkdown(content: string) {
  const withoutEmphasis = content
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");

  return withoutEmphasis
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(
        /^(\s*(?:#{1,4}\s+|[-*]\s+|\d+\.\s+)?)(.*)$/,
      );
      if (!match?.[2]) return line;
      const [, prefix, rawText] = match;
      const letters = rawText.match(/[A-Za-z]/g) ?? [];
      const uppercaseLetters = letters.filter(
        (letter) => letter === letter.toUpperCase(),
      ).length;
      let text =
        letters.length >= 4 && uppercaseLetters / letters.length >= 0.55
          ? rawText.toLowerCase()
          : rawText;

      text = text
        .replace(/(^|[.!?]\s+)([a-z])/g, (_, boundary, letter: string) =>
          `${boundary}${letter.toUpperCase()}`,
        )
        .replace(/\bi\b/g, "I")
        .replace(/\bai\b/gi, "AI")
        .replace(/\bapi\b/gi, "API")
        .replace(/\bd1\b/gi, "D1")
        .replace(/\br2\b/gi, "R2")
        .replace(/\bgpt\b/gi, "GPT")
        .replace(/\burl\b/gi, "URL")
        .replace(/\bamex\b/gi, "Amex")
        .replace(/\bvisa\b/gi, "Visa")
        .replace(/\bmastercard\b/gi, "Mastercard")
        .replace(/\byoutube\b/gi, "YouTube")
        .replace(/\bopenai\b/gi, "OpenAI")
        .replace(/\bworld war i\b/gi, "World War I");

      return `${prefix}${text}`;
    })
    .join("\n");
}

function MarkdownText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const lines = content.trim().replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  const startsBlock = (line: string) =>
    !line.trim() ||
    /^```/.test(line) ||
    /^#{1,4}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={blockIndex}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      blockIndex += 1;
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h4 key={blockIndex}>{renderInlineMarkdown(heading[1])}</h4>,
      );
      blockIndex += 1;
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={blockIndex}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={blockIndex}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      blockIndex += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !startsBlock(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={blockIndex}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <span key={lineIndex}>
            {renderInlineMarkdown(paragraphLine)}
            {lineIndex < paragraphLines.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
    blockIndex += 1;
  }

  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      {blocks}
    </div>
  );
}

function compactModelName(model: string) {
  return model.replace(/-2026-\d{2}-\d{2}$/, "");
}

function moneyFromMicros(micros: number) {
  const dollars = micros / 1_000_000;
  return dollars < 0.01 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`;
}

function formatDuration(seconds?: number, minutes?: number) {
  const totalSeconds = seconds ?? (minutes ? minutes * 60 : 0);
  if (!totalSeconds) return "duration unavailable";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return hours
    ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${mins}:${String(secs).padStart(2, "0")}`;
}

function conciseValueReason(value: string) {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  if (!cleanValue) return "AI analysis pending";
  const firstSentence = cleanValue.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  const concise = firstSentence || cleanValue;
  return concise.length > 110
    ? `${concise.slice(0, 107).trimEnd()}…`
    : concise;
}

function normalizeVideo(video: Partial<Video> & { topic?: string }): Video {
  const starterMatch = starterVideos.find((item) => item.id === video.id);
  const addedAt =
    typeof video.addedAt === "number" && video.addedAt > 0
      ? video.addedAt
      : Date.now();
  const status =
    starterMatch?.status ??
    (["feed", "inbox", "queued", "watched"].includes(video.status ?? "")
      ? (video.status as Status)
      : "feed");
  const configuredCooldownUntil = addedAt + COOLDOWN_MINUTES * 60 * 1000;
  const legacyTopic = video.topic === "Development" ? "Tech" : video.topic;
  const normalizedTopics = (
    Array.isArray(video.topics) ? video.topics : legacyTopic ? [legacyTopic] : []
  ).filter((topic): topic is Topic => topicOptions.includes(topic as Topic));
  return {
    id: video.id ?? crypto.randomUUID(),
    youtubeId: video.youtubeId ?? getYouTubeId(video.url ?? ""),
    thumbnailUrl: video.thumbnailUrl,
    description: video.description,
    publishedAt: video.publishedAt,
    tags: video.tags,
    captionAvailable: video.captionAvailable,
    metadataComplete: video.metadataComplete,
    transcriptStatus: video.transcriptStatus ?? "pending",
    analysisStatus: video.analysisStatus ?? "pending",
    url: video.url ?? "",
    title: video.title ?? "Saved YouTube video",
    channel: video.channel ?? "Metadata unavailable",
    durationMinutes: video.durationMinutes ?? 0,
    durationSeconds:
      video.durationSeconds ??
      (video.durationMinutes ? video.durationMinutes * 60 : 0),
    type: video.type === "Read" ? "Read" : "Watch",
    topics: Array.from(new Set(normalizedTopics)),
    status,
    valueScore: video.valueScore ?? 0,
    valueReason: video.valueReason ?? "AI analysis pending",
    valueFactors: video.valueFactors ?? starterMatch?.valueFactors,
    addedAt,
    cooldownUntil:
      status === "inbox"
        ? Math.min(video.cooldownUntil || configuredCooldownUntil, configuredCooldownUntil)
        : video.cooldownUntil ?? 0,
    progress: video.progress ?? 0,
    accent: video.accent ?? "red",
  };
}

function readLocalVideos() {
  const saved =
    window.localStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return starterVideos;
  try {
    return (JSON.parse(saved) as Partial<Video>[]).map(normalizeVideo);
  } catch {
    return starterVideos;
  }
}

function readLocalNotes() {
  const saved = window.localStorage.getItem(NOTES_KEY);
  if (!saved) return {};
  try {
    return JSON.parse(saved) as Record<string, string>;
  } catch {
    return {};
  }
}

function mergeVideoLibraries(local: Video[], remote: Partial<Video>[]) {
  const merged = new Map<string, Video>();
  local.map(normalizeVideo).forEach((video) => {
    merged.set(video.youtubeId ?? video.id, video);
  });
  remote.map(normalizeVideo).forEach((video) => {
    merged.set(video.youtubeId ?? video.id, video);
  });
  return Array.from(merged.values());
}

async function saveCloudLibrary(
  videos: Video[],
  notes: Record<string, string>,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/library", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videos, notes }),
    signal,
  });
  if (!response.ok) throw new Error("Cloud save failed");
  return (await response.json()) as {
    saved?: boolean;
    knowledgeStaleIds?: string[];
  };
}

export default function Home() {
  const [videos, setVideos] = useState<Video[]>(starterVideos);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [activeType, setActiveType] = useState<ContentType>("Watch");
  const [activeStatus, setActiveStatus] = useState<Status>("inbox");
  const [activeTopic, setActiveTopic] = useState<"All" | Topic>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("value");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<Video | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteUpdatedAt, setNoteUpdatedAt] = useState<Record<string, number>>({});
  const [analysisDetails, setAnalysisDetails] = useState<
    Record<string, AnalysisDetail>
  >({});
  const [knowledgeSummaries, setKnowledgeSummaries] = useState<
    Record<string, KnowledgeSummary>
  >({});
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [models, setModels] = useState<ModelConfig>({
    text: "gpt-5.4-mini-2026-03-17",
    transcription: "gpt-transcribe",
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<
    "notes" | "knowledge" | "scoring" | "usage"
  >("notes");
  const [profileTopic, setProfileTopic] = useState<"All" | Topic>("All");
  const [knowledgeBusyIds, setKnowledgeBusyIds] = useState<Set<string>>(
    new Set(),
  );
  const [sidebarWidth, setSidebarWidth] = useState(228);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("connecting");
  const [showTranscriptPaste, setShowTranscriptPaste] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptBusy, setTranscriptBusy] = useState<
    "paste" | "upload" | null
  >(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const metadataRefreshStarted = useRef(false);
  const sourceMigrationStarted = useRef(false);
  const cloudSyncStarted = useRef(false);
  const analysisStarted = useRef(new Set<string>());
  const extensionCaptureStarted = useRef(new Set<string>());
  const extensionCaptureResults = useRef(
    new Map<string, { ok: true; message: string }>(),
  );
  const knowledgeStarted = useRef(new Set<string>());
  const knowledgeQueued = useRef(new Set<string>());
  const transcriptFileInput = useRef<HTMLInputElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setVideos(readLocalVideos());
      setNotes(readLocalNotes());
      const savedSidebarWidth = Number(
        window.localStorage.getItem(SIDEBAR_WIDTH_KEY),
      );
      if (savedSidebarWidth >= 190 && savedSidebarWidth <= 380) {
        setSidebarWidth(savedSidebarWidth);
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
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(CAPTURE_BROADCAST_CHANNEL);
    channel.addEventListener("message", (event) => {
      if (event.data?.type !== "resync-item-captured" || !event.data.item) {
        return;
      }
      const capturedItem = normalizeVideo(event.data.item as Partial<Video>);
      setVideos((current) => {
        const exists = current.some((video) => video.id === capturedItem.id);
        return exists
          ? current.map((video) =>
              video.id === capturedItem.id ? capturedItem : video,
            )
          : [capturedItem, ...current];
      });
      if (document.visibilityState === "visible") {
        setActiveType(capturedItem.type);
        setActiveStatus("inbox");
        setNotice(event.data.message ?? "Captured in ReSync.");
        setNoticeTone("success");
      }
    });
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (!ready || cloudSyncStarted.current) return;
    cloudSyncStarted.current = true;
    const controller = new AbortController();

    async function hydrateCloudLibrary() {
      setCloudStatus("connecting");
      try {
        const response = await fetch("/api/library", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Cloud load failed");
        const remote = (await response.json()) as {
          exists?: boolean;
          videos?: Partial<Video>[];
          notes?: Record<string, string>;
          noteUpdatedAt?: Record<string, number>;
          analyses?: Record<
            string,
            {
              summary_markdown?: string;
              rationale_markdown?: string;
              recommendation?: string;
              learnable_points_json?: string;
            }
          >;
          knowledge?: Record<string, KnowledgeSummary>;
          usageEvents?: UsageEvent[];
          models?: ModelConfig;
        };
        const localVideos = readLocalVideos();
        const localNotes = readLocalNotes();
        const wasSynced =
          window.localStorage.getItem(CLOUD_SYNCED_KEY) === "true";
        const hasUnsavedChanges =
          window.localStorage.getItem(CLOUD_DIRTY_KEY) === "true";

        let nextVideos = localVideos;
        let nextNotes = localNotes;
        if (remote.exists) {
          const remoteVideos = Array.isArray(remote.videos) ? remote.videos : [];
          const remoteNotes =
            remote.notes && typeof remote.notes === "object" ? remote.notes : {};
          if (wasSynced && !hasUnsavedChanges) {
            nextVideos = remoteVideos.map(normalizeVideo);
            nextNotes = remoteNotes;
          } else {
            nextVideos = mergeVideoLibraries(localVideos, remoteVideos);
            nextNotes = { ...localNotes, ...remoteNotes };
          }
        }

        setVideos(nextVideos);
        setNotes(nextNotes);
        setNoteUpdatedAt(remote.noteUpdatedAt ?? {});
        setKnowledgeSummaries(remote.knowledge ?? {});
        setUsageEvents(
          Array.isArray(remote.usageEvents) ? remote.usageEvents : [],
        );
        if (remote.models) setModels(remote.models);
        setAnalysisDetails(
          Object.fromEntries(
            Object.entries(remote.analyses ?? {}).map(([itemId, analysis]) => {
              let learnablePoints: AnalysisDetail["learnablePoints"] = [];
              try {
                const parsed = JSON.parse(
                  analysis.learnable_points_json ?? "[]",
                ) as Array<{
                  title?: unknown;
                  detail?: unknown;
                  timestamp_seconds?: unknown;
                }>;
                learnablePoints = parsed
                  .filter(
                    (point) =>
                      typeof point.title === "string" &&
                      typeof point.detail === "string",
                  )
                  .map((point) => ({
                    title: point.title as string,
                    detail: point.detail as string,
                    timestampSeconds:
                      typeof point.timestamp_seconds === "number"
                        ? point.timestamp_seconds
                        : null,
                  }));
              } catch {
                learnablePoints = [];
              }
              return [
                itemId,
                {
                  summary: analysis.summary_markdown ?? "",
                  rationale: analysis.rationale_markdown ?? "",
                  recommendation: ["watch", "skim", "summary_only"].includes(
                    analysis.recommendation ?? "",
                  )
                    ? (analysis.recommendation as AnalysisDetail["recommendation"])
                    : "skim",
                  learnablePoints,
                },
              ];
            }),
          ),
        );
        window.localStorage.setItem(CLOUD_SYNCED_KEY, "true");
        setCloudReady(true);
        setCloudStatus("synced");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setCloudStatus("offline");
        }
      }
    }

    void hydrateCloudLibrary();
    return () => controller.abort();
  }, [ready]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    window.localStorage.setItem(CLOUD_DIRTY_KEY, "true");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCloudStatus("syncing");
      void saveCloudLibrary(videos, notes, controller.signal)
        .then((result) => {
          window.localStorage.removeItem(CLOUD_DIRTY_KEY);
          setCloudStatus("synced");
          void refreshKnowledgeSummaries(result.knowledgeStaleIds ?? []);
        })
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            setCloudStatus("offline");
          }
        });
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The refresh function intentionally uses the exact videos/notes snapshot
    // that produced this successful cloud save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, notes, ready, videos]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    }
  }, [ready, sidebarWidth]);

  useEffect(() => {
    if (!ready || !cloudReady || sourceMigrationStarted.current) return;
    sourceMigrationStarted.current = true;
    const controller = new AbortController();

    async function migrateLegacySources() {
      try {
        for (let batch = 0; batch < 4; batch += 1) {
          const response = await fetch("/api/storage", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "migrate", limit: 10 }),
            signal: controller.signal,
          });
          if (!response.ok) return;
          const result = (await response.json()) as { remaining?: number };
          if (!result.remaining) return;
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("ReSync source migration deferred", error);
        }
      }
    }

    void migrateLegacySources();
    return () => controller.abort();
  }, [cloudReady, ready]);

  useEffect(() => {
    if (!ready || !cloudReady || metadataRefreshStarted.current) return;
    metadataRefreshStarted.current = true;
    videos
      .filter(
        (video) =>
          video.type === "Watch" &&
          video.youtubeId &&
          (!video.metadataComplete || !video.durationSeconds),
      )
      .forEach((video) => {
        void enrichMetadata(video.id, video.url, true);
      });
  }, [cloudReady, ready, videos]);

  useEffect(() => {
    if (!ready || !cloudReady || !now) return;
    videos
      .filter(
        (video) =>
          video.status !== "feed" &&
          video.cooldownUntil <= now &&
          (video.analysisStatus ?? "pending") === "pending",
      )
      .forEach((video) => void requestAnalysis(video.id));
    // requestAnalysis intentionally uses this render's exact video snapshot;
    // analysisStarted prevents duplicate requests across subsequent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, now, ready, videos]);

  useEffect(() => {
    if (!ready || !cloudReady) return;
    const onExtensionCapture = (event: MessageEvent) => {
      if (
        event.source !== window ||
        !event.data ||
        event.data.type !== "resync-extension-capture"
      ) {
        return;
      }
      const capture = event.data.payload as ExtensionCapture;
      const captureKey = capture.captureId ?? capture.url ?? "";
      if (!captureKey) return;
      const previousResult = extensionCaptureResults.current.get(captureKey);
      if (previousResult) {
        window.postMessage(
          {
            type: "resync-extension-ack",
            captureId: capture.captureId,
            ...previousResult,
          },
          "*",
        );
        return;
      }
      if (extensionCaptureStarted.current.has(captureKey)) return;
      extensionCaptureStarted.current.add(captureKey);
      void fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(capture),
      })
        .then(async (response) => {
          const result = (await response.json().catch(() => null)) as {
            item?: Partial<Video>;
            message?: string;
            error?: string;
          } | null;
          if (!response.ok || !result?.item) {
            throw new Error(result?.error ?? "Capture failed.");
          }
          const capturedItem = normalizeVideo(result.item);
          analysisStarted.current.delete(capturedItem.id);
          setVideos((current) => {
            const exists = current.some((video) => video.id === capturedItem.id);
            return exists
              ? current.map((video) =>
                  video.id === capturedItem.id ? capturedItem : video,
                )
              : [capturedItem, ...current];
          });
          setActiveType(capturedItem.type);
          setActiveStatus("inbox");
          setNotice(result.message ?? "Captured in ReSync.");
          setNoticeTone("success");
          if (capturedItem.type === "Watch") {
            void enrichMetadata(capturedItem.id, capturedItem.url, true);
          }
          const acknowledgement = {
            ok: true as const,
            message: result.message ?? "Saved to ReSync Inbox.",
          };
          extensionCaptureResults.current.set(captureKey, acknowledgement);
          if (extensionCaptureResults.current.size > 200) {
            const oldest = extensionCaptureResults.current.keys().next().value;
            if (typeof oldest === "string") {
              extensionCaptureResults.current.delete(oldest);
            }
          }
          extensionCaptureStarted.current.delete(captureKey);
          if ("BroadcastChannel" in window) {
            const channel = new BroadcastChannel(CAPTURE_BROADCAST_CHANNEL);
            channel.postMessage({
              type: "resync-item-captured",
              item: capturedItem,
              message: acknowledgement.message,
            });
            channel.close();
          }
          window.postMessage(
            {
              type: "resync-extension-ack",
              captureId: capture.captureId,
              ...acknowledgement,
            },
            "*",
          );
        })
        .catch((error) => {
          extensionCaptureStarted.current.delete(captureKey);
          setNotice(
            error instanceof Error ? error.message : "Capture failed.",
          );
          setNoticeTone("error");
          window.postMessage(
            {
              type: "resync-extension-ack",
              captureId: capture.captureId,
              ok: false,
              message:
                error instanceof Error ? error.message : "Capture failed.",
            },
            "*",
          );
        });
    };
    window.addEventListener("message", onExtensionCapture);
    return () => window.removeEventListener("message", onExtensionCapture);
  }, [cloudReady, ready]);

  useEffect(() => {
    if (!selectedId && !profileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (profileOpen) setProfileOpen(false);
        else setSelectedId(null);
      }
    };
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    window.queueMicrotask(() => {
      setChatMessages([]);
      setChatInput("");
      setChatLoading(true);
    });
    void fetch(`/api/chat?itemId=${encodeURIComponent(selectedId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chat history unavailable.");
        const result = (await response.json()) as {
          messages?: ChatMessage[];
        };
        setChatMessages(
          Array.isArray(result.messages) ? result.messages : [],
        );
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setChatMessages([]);
        }
      })
      .finally(() => setChatLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    chatMessagesRef.current?.scrollTo({
      top: chatMessagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatBusy, chatMessages]);

  useEffect(() => {
    if (!profileOpen || profileTab !== "usage") return;
    const controller = new AbortController();
    void fetch("/api/library", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          usageEvents?: UsageEvent[];
        };
        if (Array.isArray(result.usageEvents)) {
          setUsageEvents(result.usageEvents);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [profileOpen, profileTab]);

  const selectedVideo = videos.find((video) => video.id === selectedId) ?? null;
  const selectedAnalysis = selectedId ? analysisDetails[selectedId] : undefined;

  const counts = useMemo(
    () => ({
      feed: videos.filter(
        (video) => video.type === activeType && video.status === "feed",
      ).length,
      inbox: videos.filter(
        (video) => video.type === activeType && video.status === "inbox",
      ).length,
      queued: videos.filter(
        (video) => video.type === activeType && video.status === "queued",
      ).length,
      watched: videos.filter(
        (video) => video.type === activeType && video.status === "watched",
      ).length,
    }),
    [activeType, videos],
  );
  const feedCounts = useMemo(
    () => ({
      Watch: videos.filter(
        (video) => video.type === "Watch" && video.status === "feed",
      ).length,
      Read: videos.filter(
        (video) => video.type === "Read" && video.status === "feed",
      ).length,
    }),
    [videos],
  );

  const visibleVideos = useMemo(() => {
    const result = videos.filter((video) => {
      const matchesType = video.type === activeType;
      const matchesStatus = video.status === activeStatus;
      const matchesTopic =
        activeTopic === "All" || video.topics.includes(activeTopic);
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        video.title.toLowerCase().includes(query) ||
        video.channel.toLowerCase().includes(query);
      return matchesType && matchesStatus && matchesTopic && matchesSearch;
    });

    return result.sort((a, b) => {
      if (sort === "newest") return b.addedAt - a.addedAt;
      if (sort === "shortest") {
        const aDuration = a.durationSeconds || 0;
        const bDuration = b.durationSeconds || 0;
        if (!aDuration && !bDuration) return b.addedAt - a.addedAt;
        if (!aDuration) return 1;
        if (!bDuration) return -1;
        return aDuration - bDuration;
      }
      return b.valueScore - a.valueScore;
    });
  }, [activeStatus, activeTopic, activeType, search, sort, videos]);

  const totalMinutes = visibleVideos.reduce(
    (sum, video) => sum + video.durationMinutes,
    0,
  );

  const profileNotes = useMemo(
    () =>
      videos
        .filter(
          (video) =>
            (notes[video.id] ?? "").trim() &&
            (profileTopic === "All" || video.topics.includes(profileTopic)),
        )
        .sort(
          (a, b) =>
            (noteUpdatedAt[b.id] ?? b.addedAt) -
            (noteUpdatedAt[a.id] ?? a.addedAt),
        ),
    [noteUpdatedAt, notes, profileTopic, videos],
  );

  const profileKnowledge = useMemo(
    () =>
      videos
        .filter(
          (video) =>
            knowledgeSummaries[video.id] &&
            (profileTopic === "All" || video.topics.includes(profileTopic)),
        )
        .sort(
          (a, b) =>
            knowledgeSummaries[b.id].updatedAt -
            knowledgeSummaries[a.id].updatedAt,
        ),
    [knowledgeSummaries, profileTopic, videos],
  );

  const usageByItem = useMemo(() => {
    const summaries = new Map<
      string,
      {
        events: number;
        textInput: number;
        cachedInput: number;
        textOutput: number;
        transcriptionInput: number;
        transcriptOutput: number;
        costMicros: number;
        unknownCost: boolean;
        models: Set<string>;
        lastUsedAt: number;
      }
    >();
    for (const event of usageEvents) {
      const summary = summaries.get(event.item_id) ?? {
        events: 0,
        textInput: 0,
        cachedInput: 0,
        textOutput: 0,
        transcriptionInput: 0,
        transcriptOutput: 0,
        costMicros: 0,
        unknownCost: false,
        models: new Set<string>(),
        lastUsedAt: 0,
      };
      summary.events += 1;
      summary.models.add(event.model);
      summary.lastUsedAt = Math.max(summary.lastUsedAt, event.created_at);
      if (event.purpose === "transcription") {
        summary.transcriptionInput +=
          event.audio_input_tokens || event.input_tokens;
        summary.transcriptOutput += event.output_tokens;
      } else {
        summary.textInput += event.input_tokens;
        summary.cachedInput += event.cached_input_tokens;
        summary.textOutput += event.output_tokens;
      }
      if (event.estimated_cost_micros === null) summary.unknownCost = true;
      else summary.costMicros += event.estimated_cost_micros;
      summaries.set(event.item_id, summary);
    }
    return summaries;
  }, [usageEvents]);

  async function refreshKnowledgeSummaries(itemIds: string[]) {
    for (const itemId of itemIds) {
      if (knowledgeStarted.current.has(itemId)) {
        knowledgeQueued.current.add(itemId);
        continue;
      }
      knowledgeStarted.current.add(itemId);
      setKnowledgeBusyIds((current) => new Set(current).add(itemId));
      try {
        const response = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const result = (await response.json().catch(() => null)) as {
          status?: string;
          summary?: string;
          noteHash?: string;
          model?: string;
          updatedAt?: number;
        } | null;
        if (
          response.ok &&
          result?.summary &&
          result.noteHash &&
          result.model &&
          result.updatedAt
        ) {
          const video = videos.find((entry) => entry.id === itemId);
          setKnowledgeSummaries((current) => ({
            ...current,
            [itemId]: {
              summary: result.summary!,
              noteHash: result.noteHash!,
              model: result.model!,
              updatedAt: result.updatedAt!,
              topics: video?.topics ?? [],
            },
          }));
        } else if (response.ok && result?.status === "empty") {
          setKnowledgeSummaries((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
        }
      } finally {
        knowledgeStarted.current.delete(itemId);
        setKnowledgeBusyIds((current) => {
          const next = new Set(current);
          next.delete(itemId);
          return next;
        });
        if (knowledgeQueued.current.delete(itemId)) {
          void refreshKnowledgeSummaries([itemId]);
        }
      }
    }
  }

  async function enrichMetadata(id: string, videoUrl: string, quiet = false) {
    try {
      const response = await fetch(`/api/youtube?url=${encodeURIComponent(videoUrl)}`);
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (response.status === 400 || response.status === 404) {
          setVideos((current) => current.filter((video) => video.id !== id));
          if (!quiet) {
            setNotice(problem?.error ?? "That YouTube link is invalid.");
            setNoticeTone("error");
          }
          return;
        }
        throw new Error("Metadata request failed");
      }
      const metadata = (await response.json()) as {
        title: string;
        channel: string;
        thumbnailUrl?: string;
        description?: string;
        durationMinutes?: number;
        durationSeconds?: number;
        publishedAt?: string | null;
        tags?: string[];
        captionAvailable?: boolean | null;
        metadataComplete?: boolean;
      };
      setVideos((current) =>
        current.map((video) =>
          video.id === id
            ? {
                ...video,
                title: metadata.title,
                channel: metadata.channel,
                thumbnailUrl: metadata.thumbnailUrl,
                description: metadata.description,
                durationMinutes: metadata.durationMinutes ?? 0,
                durationSeconds: metadata.durationSeconds ?? 0,
                publishedAt: metadata.publishedAt,
                tags: metadata.tags,
                captionAvailable: metadata.captionAvailable,
                metadataComplete: metadata.metadataComplete,
              }
            : video,
        ),
      );
      if (!quiet) {
        setNotice(
          metadata.metadataComplete
            ? `Saved to Inbox with full metadata. ${COOLDOWN_MINUTES}-minute cooldown started.`
            : `Saved to Inbox. Add the YouTube API key to fetch duration and full metadata.`,
        );
        setNoticeTone(metadata.metadataComplete ? "success" : "info");
      }
    } catch {
      setVideos((current) =>
        current.map((video) =>
          video.id === id
            ? { ...video, channel: "Metadata temporarily unavailable" }
            : video,
        ),
      );
      if (!quiet) {
        setNotice("Saved to Inbox, but YouTube metadata is temporarily unavailable.");
        setNoticeTone("error");
      }
    }
  }

  function applyAnalysisResult(id: string, result: AnalysisApiResult) {
    if (result.status !== "complete" || !result.analysis) return false;
    setVideos((current) =>
      current.map((video) =>
        video.id === id
          ? {
              ...video,
              type: result.analysis?.type ?? video.type,
              topics: Array.isArray(result.analysis?.topics)
                ? result.analysis.topics
                : video.topics,
              valueScore: result.analysis?.value_score ?? video.valueScore,
              valueReason: result.analysis?.value_reason ?? video.valueReason,
              valueFactors: result.analysis?.valueFactors ?? video.valueFactors,
              transcriptStatus: "available",
              analysisStatus: "complete",
            }
          : video,
      ),
    );
    if (
      typeof result.analysis.summary_markdown === "string" &&
      typeof result.analysis.rationale_markdown === "string" &&
      ["watch", "skim", "summary_only"].includes(
        result.analysis.recommendation ?? "",
      )
    ) {
      setAnalysisDetails((current) => ({
        ...current,
        [id]: {
          summary: result.analysis?.summary_markdown ?? "",
          rationale: result.analysis?.rationale_markdown ?? "",
          recommendation: result.analysis
            ?.recommendation as AnalysisDetail["recommendation"],
          learnablePoints: (result.analysis?.learnable_points ?? []).map(
            (point) => ({
              title: point.title,
              detail: point.detail,
              timestampSeconds: point.timestamp_seconds,
            }),
          ),
        },
      }));
    }
    return true;
  }

  async function requestAnalysis(id: string) {
    if (analysisStarted.current.has(id)) return;
    analysisStarted.current.add(id);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      const result = (await response
        .json()
        .catch(() => null)) as AnalysisApiResult | null;

      if (
        result?.status === "transcript_unavailable" ||
        result?.status === "content_unavailable"
      ) {
        setVideos((current) =>
          current.map((video) =>
            video.id === id
              ? {
                  ...video,
                  transcriptStatus: "unavailable",
                  analysisStatus: "unavailable",
                }
              : video,
          ),
        );
        setNotice(result.message ?? "Transcript unavailable. AI analysis was skipped.");
        setNoticeTone("info");
        return;
      }
      if (result?.status === "cooldown_pending") return;

      if (!response.ok || !result || !applyAnalysisResult(id, result)) {
        throw new Error(result?.error ?? "Analysis failed");
      }

      setNotice("AI selected the content type and topics from the transcript.");
      setNoticeTone("success");
    } catch {
      analysisStarted.current.delete(id);
      setVideos((current) =>
        current.map((video) =>
          video.id === id ? { ...video, analysisStatus: "error" } : video,
        ),
      );
      setNotice("Transcript analysis is temporarily unavailable.");
      setNoticeTone("error");
    }
  }

  async function analyzePastedTranscript(id: string) {
    const transcript = transcriptText.trim();
    if (transcript.length < 40) {
      setNotice("Paste a fuller transcript before running the analysis.");
      setNoticeTone("error");
      return;
    }
    setTranscriptBusy("paste");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: id,
          transcript,
          source: "manual-paste",
        }),
      });
      const result = (await response
        .json()
        .catch(() => null)) as AnalysisApiResult | null;
      if (!response.ok || !result || !applyAnalysisResult(id, result)) {
        throw new Error(result?.error ?? "Transcript analysis failed.");
      }
      setShowTranscriptPaste(false);
      setTranscriptText("");
      setNotice("Transcript saved and analyzed.");
      setNoticeTone("success");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Transcript analysis is temporarily unavailable.",
      );
      setNoticeTone("error");
    } finally {
      setTranscriptBusy(null);
    }
  }

  async function transcribeFile(id: string, file: File) {
    if (file.size > 25 * 1024 * 1024) {
      setNotice("Choose a file that is 25 MB or smaller.");
      setNoticeTone("error");
      return;
    }
    setTranscriptBusy("upload");
    try {
      const form = new FormData();
      form.set("itemId", id);
      form.set("file", file);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const result = (await response
        .json()
        .catch(() => null)) as AnalysisApiResult | null;
      if (!response.ok || !result || !applyAnalysisResult(id, result)) {
        throw new Error(result?.error ?? "Transcription failed.");
      }
      setNotice("Bangla/English transcript generated, saved, and analyzed.");
      setNoticeTone("success");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Transcription is temporarily unavailable.",
      );
      setNoticeTone("error");
    } finally {
      setTranscriptBusy(null);
      if (transcriptFileInput.current) {
        transcriptFileInput.current.value = "";
      }
    }
  }

  async function sendChat(event: FormEvent, itemId: string) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    const optimisticId = `pending:${Date.now()}`;
    setChatBusy(true);
    setChatInput("");
    setChatMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: message,
        createdAt: Date.now(),
      },
    ]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, message }),
      });
      const result = (await response.json().catch(() => null)) as {
        messages?: ChatMessage[];
        error?: string;
      } | null;
      if (!response.ok || !Array.isArray(result?.messages)) {
        throw new Error(result?.error ?? "ReSync AI could not answer.");
      }
      setChatMessages((current) => [
        ...current.filter((entry) => entry.id !== optimisticId),
        ...result.messages!,
      ]);
    } catch (error) {
      setChatMessages((current) =>
        current.filter((entry) => entry.id !== optimisticId),
      );
      setChatInput((current) => (current.trim() ? current : message));
      setNotice(
        error instanceof Error
          ? error.message
          : "ReSync AI is temporarily unavailable.",
      );
      setNoticeTone("error");
    } finally {
      setChatBusy(false);
    }
  }

  function addContent(event: FormEvent) {
    event.preventDefault();
    const value = url.trim();
    const youtubeId = getYouTubeId(value);
    const webUrl = getWebUrl(value);

    if (!webUrl) {
      setNotice("Paste a valid YouTube or article link beginning with http:// or https://.");
      setNoticeTone("error");
      return;
    }
    if (isYouTubeUrl(webUrl) && !youtubeId) {
      setNotice("Paste a valid YouTube video link.");
      setNoticeTone("error");
      return;
    }
    const detectedType: ContentType = youtubeId ? "Watch" : "Read";

    if (
      videos.some(
        (video) =>
          (youtubeId && video.youtubeId === youtubeId) ||
          video.url.replace(/\/$/, "") === value.replace(/\/$/, ""),
      )
    ) {
      setNotice(`Already in ${detectedType === "Watch" ? "RePlay" : "ReRead"} — no duplicate added.`);
      setNoticeTone("error");
      return;
    }

    const addedAt = Date.now();
    const readDetails =
      detectedType === "Read" ? articleDetails(webUrl) : undefined;
    const newVideo: Video = {
      id: crypto.randomUUID(),
      youtubeId,
      url: value,
      title: readDetails?.title ?? "Fetching video details…",
      channel: readDetails?.channel ?? "YouTube",
      durationMinutes: 0,
      type: detectedType,
      topics: [],
      status: "inbox",
      valueScore: 0,
      valueReason: "AI analysis pending",
      addedAt,
      cooldownUntil: addedAt + COOLDOWN_MINUTES * 60 * 1000,
      progress: 0,
      accent: "red",
      transcriptStatus: "pending",
      analysisStatus: "pending",
    };

    setVideos((current) => [newVideo, ...current]);
    setActiveType(detectedType);
    setActiveStatus("inbox");
    setUrl("");
    if (detectedType === "Watch") {
      setNotice("Saved instantly. Fetching title, duration, and channel…");
      setNoticeTone("info");
      void enrichMetadata(newVideo.id, value);
    } else {
      setNotice(
        `Article saved to Inbox. ${COOLDOWN_MINUTES}-minute cooldown started.`,
      );
      setNoticeTone("success");
    }
  }

  function changeStatus(id: string, status: Status) {
    setOpenMenuId(null);
    setVideos((current) =>
      current.map((video) =>
        video.id === id
          ? { ...video, status, progress: status === "watched" ? 100 : video.progress }
          : video,
      ),
    );
  }

  function addToInbox(id: string) {
    setOpenMenuId(null);
    const addedAt = now;
    setVideos((current) =>
      current.map((video) =>
        video.id === id
          ? {
              ...video,
              status: "inbox",
              addedAt,
              cooldownUntil: addedAt + COOLDOWN_MINUTES * 60 * 1000,
            }
          : video,
      ),
    );
    setActiveStatus("inbox");
    setNotice(`Added to Inbox. ${COOLDOWN_MINUTES}-minute cooldown started.`);
    setNoticeTone("success");
  }

  function moveToQueue(id: string) {
    setOpenMenuId(null);
    setVideos((current) =>
      current.map((video) =>
        video.id === id && video.cooldownUntil <= now
          ? { ...video, status: "queued" }
          : video,
      ),
    );
    setActiveStatus("queued");
    setNotice("Cooldown complete. Item moved to Queue.");
    setNoticeTone("success");
  }

  function updateVideo(id: string, changes: Partial<Video>) {
    setVideos((current) =>
      current.map((video) => (video.id === id ? { ...video, ...changes } : video)),
    );
  }

  function openVideo(id: string) {
    setOpenMenuId(null);
    setShowTranscriptPaste(false);
    setTranscriptText("");
    setSelectedId(id);
  }

  function toggleTopic(id: string, topic: Topic) {
    setVideos((current) =>
      current.map((video) =>
        video.id === id
          ? {
              ...video,
              topics: video.topics.includes(topic)
                ? video.topics.filter((item) => item !== topic)
                : [...video.topics, topic],
            }
          : video,
      ),
    );
  }

  function startSidebarResize(startX: number) {
    const startWidth = sidebarWidth;
    const onMove = (event: PointerEvent) => {
      setSidebarWidth(
        Math.min(380, Math.max(190, startWidth + event.clientX - startX)),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizing-sidebar");
    };
    document.body.classList.add("resizing-sidebar");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function removeVideo(video: Video) {
    setOpenMenuId(null);
    setVideos((current) => current.filter((item) => item.id !== video.id));
    setLastRemoved(video);
    if (selectedId === video.id) setSelectedId(null);
    setNotice(`${video.type === "Watch" ? "Video" : "Article"} removed.`);
    setNoticeTone("success");
  }

  function undoRemove() {
    if (!lastRemoved) return;
    setVideos((current) => [lastRemoved, ...current]);
    setLastRemoved(null);
    setNotice("Item restored.");
    setNoticeTone("success");
  }

  return (
    <main
      className="app-shell"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="ReSync home">
          <span className="brand-mark" aria-hidden="true" />
          <span>ReSync</span>
        </a>

        <p className="sidebar-label page-label">Library</p>
        <nav className="primary-nav" aria-label="ReSync library sections">
          {[
            ["Watch", "RePlay"],
            ["Read", "ReRead"],
          ].map(([type, label]) => (
            <button
              className={
                activeType === type && activeStatus === "feed"
                  ? "nav-item content-tab active"
                  : "nav-item content-tab"
              }
              key={type}
              onClick={() => {
                setActiveType(type as ContentType);
                setActiveStatus("feed");
              }}
            >
              <span>{label}</span>
              <span className="nav-count">
                {feedCounts[type as ContentType]}
              </span>
            </button>
          ))}
          <div className="nav-protocol">
            {[
              ["inbox", "Inbox"],
              ["queued", "Queue"],
              ["watched", "Finished"],
            ].map(([key, label]) => (
              <button
                className={activeStatus === key ? "nav-item active" : "nav-item"}
                key={key}
                onClick={() => setActiveStatus(key as Status)}
              >
                <span>{label}</span>
                <span className="nav-count">
                  {counts[key as keyof typeof counts]}
                </span>
              </button>
            ))}
          </div>
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
            <span>Cloud library</span>
            <span>
              {cloudStatus === "synced"
                ? "Synced"
                : cloudStatus === "offline"
                  ? "Offline"
                  : cloudStatus === "syncing"
                    ? "Saving…"
                    : "Connecting…"}
            </span>
          </div>
          <div className={`storage-track ${cloudStatus}`}>
            <span style={{ width: `${Math.min(100, videos.length * 7)}%` }} />
          </div>
          <p>{videos.length} items · available across your devices.</p>
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={190}
          aria-valuemax={380}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={(event) => startSidebarResize(event.clientX)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              setSidebarWidth((width) => Math.max(190, width - 10));
            }
            if (event.key === "ArrowRight") {
              setSidebarWidth((width) => Math.min(380, width + 10));
            }
          }}
        />
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              ReSync / {activeType === "Watch" ? "RePlay" : "ReRead"}
            </p>
            <h1>
              Save the urge. {activeType === "Watch" ? "Watch" : "Read"} with
              intention.
            </h1>
            <p className="intro-copy">
              Curated discoveries become intentional choices: Inbox, cooldown, then Queue.
            </p>
          </div>
          <button
            type="button"
            className="profile"
            aria-label="Open notes and AI settings"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen(true)}
          >
            MT
          </button>
        </header>

        <section
          className="capture-panel"
          aria-label={`Add ${activeType === "Watch" ? "a video" : "an article"}`}
        >
          <form onSubmit={addContent}>
            <div className="capture-icon">↗</div>
            <label className="sr-only" htmlFor="content-url">
              {activeType === "Watch" ? "YouTube video URL" : "Article URL"}
            </label>
            <input
              id="content-url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setNotice("");
                setNoticeTone("info");
              }}
              placeholder={
                activeType === "Watch"
                  ? "Paste a YouTube link…"
                  : "Paste a blog or article link…"
              }
              inputMode="url"
              autoComplete="off"
            />
            <span className="paste-hint">⌘ V</span>
            <button type="submit">Add to Inbox</button>
          </form>
          <div className={`capture-meta ${noticeTone}`}>
            <span className="status-light" />
            <span>
              {notice ||
                `Pasted ${activeType === "Watch" ? "videos" : "articles"} go to Inbox · ${COOLDOWN_MINUTES}-minute cooldown`}
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
              <span className="sr-only">Search library</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
              />
            </label>
            <select
              aria-label="Sort library"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="value">Highest value</option>
              <option value="newest">Newest added</option>
              {activeType === "Watch" ? (
                <option value="shortest">Shortest first</option>
              ) : null}
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
            <strong>{visibleVideos.length}</strong>{" "}
            {activeType === "Watch" ? "videos" : "articles"}
            {activeType === "Watch" ? (
              <>
                <span>·</span>
                <strong>
                  {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
                </strong>
              </>
            ) : null}
            <span>in this view</span>
          </p>
          <p>
            After cooldown, GPT-5.4 mini summarizes and scores captured
            transcripts or article text.
          </p>
        </div>

        <section className={`video-library ${view}`}>
          {visibleVideos.map((video, index) => {
            const isCooling =
              video.status === "inbox" && now > 0 && video.cooldownUntil > now;
            const isInboxReady =
              video.status === "inbox" && now > 0 && video.cooldownUntil <= now;
            const canWatch =
              video.status === "queued" || video.status === "watched";
            const imageUrl =
              video.thumbnailUrl ??
              (video.youtubeId
                ? `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`
                : undefined);
            return (
              <article className="video-card" key={video.id}>
                <button
                  className={`video-thumb ${video.accent}`}
                  onClick={() => openVideo(video.id)}
                  aria-label={`Open ${video.title} in ${
                    video.type === "Watch" ? "RePlay" : "ReRead"
                  }`}
                  style={
                    imageUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(10, 13, 20, .82)), url("${imageUrl}")`,
                        }
                      : undefined
                  }
                >
                  <span className="rank">#{index + 1}</span>
                  {video.status === "feed" ? (
                    <span className="cooldown-pill">Curated</span>
                  ) : isCooling ? (
                    <span className="cooldown-pill">Cooling · {countdown(video.cooldownUntil, now)}</span>
                  ) : isInboxReady ? (
                    <span className="cooldown-pill ready">Ready for Queue</span>
                  ) : null}
                  <span className={canWatch ? "play-button" : "play-button locked"}>
                    {video.status === "feed"
                      ? "+"
                      : isCooling
                        ? "◷"
                        : isInboxReady
                          ? "→"
                          : video.type === "Watch"
                            ? "▶"
                            : "↗"}
                  </span>
                  <span className="duration">
                    {video.type === "Watch"
                      ? formatDuration(video.durationSeconds, video.durationMinutes)
                      : "Article"}
                  </span>
                  {video.progress > 0 && video.progress < 100 ? (
                    <span className="progress" style={{ width: `${video.progress}%` }} />
                  ) : null}
                </button>

                <div className="card-content">
                  <div className="card-topline">
                    <span className="topic-badges">
                      {(video.topics.length ? video.topics : ["Unsorted"]).map(
                        (topic) => (
                          <span className="topic-badge" key={topic}>
                            {topic}
                          </span>
                        ),
                      )}
                    </span>
                    <span className="added-time">
                      {relativeTime(video.addedAt, now || video.addedAt + 60000)}
                    </span>
                  </div>
                  <button className="title-button" onClick={() => openVideo(video.id)}>
                    <h2>{video.title}</h2>
                  </button>
                  <p className="channel">{video.channel}</p>
                  <div className="value-row">
                    <span className={video.valueScore ? "value-score" : "value-score pending"}>
                      {video.valueScore ? `${video.valueScore}` : "—"}
                    </span>
                    <span className="value-copy">
                      <strong>
                        {video.analysisStatus === "unavailable"
                          ? video.type === "Watch"
                            ? "Transcript unavailable"
                            : "Article text unavailable"
                          : video.analysisStatus === "complete"
                            ? "AI score"
                            : video.valueScore
                              ? "Prototype value score"
                              : "AI analysis pending"}
                      </strong>
                      <span className="value-reason">
                        {video.analysisStatus === "unavailable"
                          ? video.type === "Watch"
                            ? "Capture or paste the YouTube transcript."
                            : "Capture this page with the extension."
                          : conciseValueReason(video.valueReason)}
                      </span>
                    </span>
                  </div>
                  <div className="card-actions">
                    {video.status === "feed" ? (
                      <button
                        className="primary-action"
                        onClick={() => addToInbox(video.id)}
                      >
                        Add to Inbox
                      </button>
                    ) : video.status === "inbox" && isCooling ? (
                      <button className="cooling-action" disabled>
                        Move to Queue · {countdown(video.cooldownUntil, now)}
                      </button>
                    ) : video.status === "inbox" ? (
                      <button
                        className="primary-action"
                        onClick={() => moveToQueue(video.id)}
                      >
                        Move to Queue
                      </button>
                    ) : video.status === "queued" ? (
                      <button
                        className="primary-action"
                        onClick={() => changeStatus(video.id, "watched")}
                      >
                        Move to Finished
                      </button>
                    ) : video.status === "watched" ? (
                      <button
                        className="primary-action"
                        onClick={() => changeStatus(video.id, "queued")}
                      >
                        Move to Queue
                      </button>
                    ) : null}
                    <div className="overflow-menu-wrap">
                      <button
                        className="icon-action overflow-trigger"
                        aria-label={`More actions for ${video.title}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === video.id}
                        onClick={() =>
                          setOpenMenuId((current) =>
                            current === video.id ? null : video.id,
                          )
                        }
                      >
                        •••
                      </button>
                      {openMenuId === video.id ? (
                        <div className="card-overflow-menu" role="menu">
                          {video.status === "inbox" ? (
                            <button
                              role="menuitem"
                              onClick={() => changeStatus(video.id, "watched")}
                            >
                              Move to Finished
                            </button>
                          ) : video.status === "queued" ||
                            video.status === "watched" ? (
                            <button
                              role="menuitem"
                              onClick={() => addToInbox(video.id)}
                            >
                              Move to Inbox
                            </button>
                          ) : null}
                          <button
                            className="danger"
                            role="menuitem"
                            onClick={() => removeVideo(video)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
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
            <p>
              Try another topic or paste a{" "}
              {activeType === "Watch" ? "YouTube" : "blog"} link above.
            </p>
          </section>
        ) : null}
      </section>

      {lastRemoved ? (
        <div className="undo-toast" role="status">
          <span>Item removed</span>
          <button onClick={undoRemove}>Undo</button>
          <button aria-label="Dismiss" onClick={() => setLastRemoved(null)}>
            ×
          </button>
        </div>
      ) : null}

      {profileOpen ? (
        <div
          className="profile-backdrop"
          role="presentation"
          onMouseDown={() => setProfileOpen(false)}
        >
          <section
            className="profile-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Your ReSync notes and AI settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="profile-panel-header">
              <div>
                <span className="profile-large">MT</span>
                <div>
                  <p className="eyebrow">Your ReSync</p>
                  <h2>Notes & learning memory</h2>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close profile"
                onClick={() => setProfileOpen(false)}
              >
                ×
              </button>
            </header>

            <nav className="profile-tabs" aria-label="Profile sections">
              {(
                [
                  ["notes", "Saved notes"],
                  ["knowledge", "AI summaries"],
                  ["scoring", "Scoring & models"],
                  ["usage", "Usage"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  type="button"
                  key={tab}
                  className={profileTab === tab ? "active" : ""}
                  aria-current={profileTab === tab ? "page" : undefined}
                  onClick={() => setProfileTab(tab)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {profileTab === "notes" || profileTab === "knowledge" ? (
              <div className="profile-filter" aria-label="Filter notes by topic">
                {topics.map((topic) => (
                  <button
                    type="button"
                    key={topic}
                    className={profileTopic === topic ? "active" : ""}
                    onClick={() => setProfileTopic(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="profile-content">
              {profileTab === "notes" ? (
                profileNotes.length ? (
                  <div className="profile-note-list">
                    {profileNotes.map((video) => (
                      <article className="profile-note-card" key={video.id}>
                        <div className="profile-note-meta">
                          <span>{video.type}</span>
                          <time>
                            {new Date(
                              noteUpdatedAt[video.id] ?? video.addedAt,
                            ).toLocaleDateString("en-BD", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            openVideo(video.id);
                          }}
                        >
                          <h3>{video.title}</h3>
                          <p>{video.channel}</p>
                        </button>
                        <MarkdownText
                          content={notes[video.id]}
                          className="profile-note-body"
                        />
                        <div className="profile-topic-row">
                          {(video.topics.length ? video.topics : ["Unsorted"]).map(
                            (topic) => (
                              <span key={topic}>{topic}</span>
                            ),
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="profile-empty">
                    <span>✎</span>
                    <h3>No notes in this topic yet</h3>
                    <p>Your working notes appear here as soon as you write them.</p>
                  </div>
                )
              ) : null}

              {profileTab === "knowledge" ? (
                <>
                  <p className="profile-explainer">
                    ReSync condenses your own notes into durable learning memory.
                    Future scores compare new content against this memory, lowering
                    novelty and other repetition-sensitive factors.
                  </p>
                  {profileKnowledge.length ? (
                    <div className="profile-note-list">
                      {profileKnowledge.map((video) => {
                        const learned = knowledgeSummaries[video.id];
                        return (
                          <article
                            className="profile-note-card knowledge-card"
                            key={video.id}
                          >
                            <div className="profile-note-meta">
                              <span>AI learning summary</span>
                              <time>
                                {new Date(learned.updatedAt).toLocaleDateString(
                                  "en-BD",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </time>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setProfileOpen(false);
                                openVideo(video.id);
                              }}
                            >
                              <h3>{video.title}</h3>
                              <p>{video.channel}</p>
                            </button>
                            <MarkdownText
                              content={learned.summary}
                              className="profile-note-body"
                            />
                            <small>Generated with {learned.model}</small>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="profile-empty">
                      <span>✦</span>
                      <h3>No AI learning summaries yet</h3>
                      <p>
                        Write meaningful working notes; ReSync summarizes them
                        after they sync.
                      </p>
                    </div>
                  )}
                </>
              ) : null}

              {profileTab === "scoring" ? (
                <div className="profile-settings">
                  <section>
                    <p className="eyebrow">Personal value /100</p>
                    <h3>Scoring criteria</h3>
                    <p>
                      The score is the exact sum of these five factors. Your AI
                      learning memory is supplied as the baseline for every new
                      analysis.
                    </p>
                    <div className="criteria-list">
                      {[
                        [
                          "Novelty",
                          25,
                          "New relative to what you have already learned.",
                        ],
                        [
                          "Actionability",
                          25,
                          "Specific new actions or decisions it enables.",
                        ],
                        [
                          "Information density",
                          20,
                          "Non-redundant value delivered per section.",
                        ],
                        [
                          "Evidence quality",
                          15,
                          "How well the source supports important claims.",
                        ],
                        [
                          "Time efficiency",
                          15,
                          "Whether its new value justifies your time.",
                        ],
                      ].map(([label, max, description]) => (
                        <div className="criterion" key={label}>
                          <strong>
                            {label} <span>/{max}</span>
                          </strong>
                          <p>{description}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <p className="eyebrow">AI configuration</p>
                    <h3>Models in use</h3>
                    <div className="model-list">
                      <div>
                        <span>Text, scoring, chat & note summaries</span>
                        <strong>{models.text}</strong>
                      </div>
                      <div>
                        <span>Uploaded audio/video transcription</span>
                        <strong>{models.transcription}</strong>
                        <small>
                          Only used when you choose Generate transcript. Pasted or
                          extension-captured text skips transcription.
                        </small>
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}

              {profileTab === "usage" ? (
                <div className="usage-section">
                  <div className="usage-intro">
                    <div>
                      <p className="eyebrow">Per-video accounting</p>
                      <h3>AI usage recorded by ReSync</h3>
                    </div>
                    <p>
                      Costs use standard API list prices when the model has a
                      public price. Account-wide free allowances are not
                      subtracted because an individual API response does not say
                      whether those credits were applied.
                    </p>
                  </div>
                  {Array.from(usageByItem.entries())
                    .map(([itemId, usage]) => ({
                      video: videos.find((entry) => entry.id === itemId),
                      usage,
                    }))
                    .filter(
                      (
                        entry,
                      ): entry is {
                        video: Video;
                        usage: ReturnType<typeof usageByItem.get> & {};
                      } => Boolean(entry.video),
                    )
                    .sort(
                      (a, b) => b.usage.lastUsedAt - a.usage.lastUsedAt,
                    )
                    .map(({ video, usage }) => (
                      <article className="usage-card" key={video.id}>
                        <div>
                          <h4>{video.title}</h4>
                          <span>
                            {Array.from(usage.models)
                              .map(compactModelName)
                              .join(" · ")}
                          </span>
                        </div>
                        <dl>
                          <div>
                            <dt>Transcript input</dt>
                            <dd>{usage.transcriptionInput.toLocaleString()} tokens</dd>
                          </div>
                          <div>
                            <dt>Transcript output</dt>
                            <dd>{usage.transcriptOutput.toLocaleString()} tokens</dd>
                          </div>
                          <div>
                            <dt>Text AI input</dt>
                            <dd>{usage.textInput.toLocaleString()} tokens</dd>
                          </div>
                          <div>
                            <dt>Text AI output</dt>
                            <dd>{usage.textOutput.toLocaleString()} tokens</dd>
                          </div>
                          <div>
                            <dt>Cached input</dt>
                            <dd>{usage.cachedInput.toLocaleString()} tokens</dd>
                          </div>
                          <div>
                            <dt>Tracked list-price cost</dt>
                            <dd>
                              {moneyFromMicros(usage.costMicros)}
                              {usage.unknownCost ? " + unpriced model usage" : ""}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  {!usageByItem.size ? (
                    <div className="profile-empty">
                      <span>◎</span>
                      <h3>No recorded usage yet</h3>
                      <p>
                        New analysis, chat, note-summary, and transcription calls
                        will appear here.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {selectedVideo ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}>
          <section
            className="replay-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedVideo.title} ${
              selectedVideo.type === "Watch" ? "RePlay" : "ReRead"
            } workspace`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close workspace"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
            <div className="player-column">
              <div className="player-stage">
                {selectedVideo.status === "feed" ? (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock">+</span>
                    <p className="eyebrow">Curated discovery</p>
                    <h2>Worth saving?</h2>
                    <p>
                      Add this {selectedVideo.type === "Watch" ? "video" : "article"}{" "}
                      to Inbox to begin its {COOLDOWN_MINUTES}-minute impulse buffer.
                      It cannot be opened directly from the curated feed.
                    </p>
                    <button onClick={() => addToInbox(selectedVideo.id)}>
                      Add to Inbox
                    </button>
                  </div>
                ) : selectedVideo.status === "inbox" &&
                  selectedVideo.cooldownUntil > now ? (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock">◷</span>
                    <p className="eyebrow">Impulse buffer</p>
                    <h2>{countdown(selectedVideo.cooldownUntil, now)}</h2>
                    <p>
                      The {selectedVideo.type === "Watch" ? "video" : "article"} is
                      saved, but not available yet. If the urge passes, remove it. If
                      the value remains, it will unlock automatically.
                    </p>
                    <button onClick={() => removeVideo(selectedVideo)}>
                      I don&apos;t need this{" "}
                      {selectedVideo.type === "Watch" ? "video" : "article"}
                    </button>
                  </div>
                ) : selectedVideo.status === "inbox" ? (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock ready">✓</span>
                    <p className="eyebrow">Cooldown complete</p>
                    <h2>Still valuable?</h2>
                    <p>
                      The initial urge has passed. Move it to Queue only if you still
                      intend to {selectedVideo.type === "Watch" ? "watch" : "read"} it.
                    </p>
                    <button onClick={() => moveToQueue(selectedVideo.id)}>
                      Move to Queue
                    </button>
                  </div>
                ) : selectedVideo.type === "Watch" && selectedVideo.youtubeId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${selectedVideo.youtubeId}?rel=0`}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : selectedVideo.type === "Read" ? (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock ready">↗</span>
                    <p className="eyebrow">Ready to read</p>
                    <h2>Open the article</h2>
                    <p>
                      ReRead keeps the article and your notes together. The source opens
                      in a new tab when you are ready.
                    </p>
                    <a
                      className="open-content-button"
                      href={selectedVideo.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read article ↗
                    </a>
                  </div>
                ) : (
                  <div className="cooldown-screen">
                    <span className="cooldown-clock">↗</span>
                    <h2>Preview card</h2>
                    <p>
                      Paste a real YouTube link to test the embedded player.
                    </p>
                  </div>
                )}
              </div>
              <div className="player-details">
                <div>
                  <span className="topic-badges">
                    {(selectedVideo.topics.length
                      ? selectedVideo.topics
                      : ["Unsorted"]
                    ).map((topic) => (
                      <span className="topic-badge" key={topic}>
                        {topic}
                      </span>
                    ))}
                  </span>
                  <h2>{selectedVideo.title}</h2>
                  <p>{selectedVideo.channel}</p>
                </div>
                {selectedVideo.status === "queued" ||
                selectedVideo.status === "watched" ? (
                  <a href={selectedVideo.url} target="_blank" rel="noreferrer">
                    {selectedVideo.type === "Watch"
                      ? "Open on YouTube ↗"
                      : "Open article ↗"}
                  </a>
                ) : null}
              </div>
            </div>

            <aside className="ai-column">
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
                    {selectedVideo.analysisStatus === "unavailable"
                      ? selectedVideo.type === "Watch"
                        ? "Transcript unavailable — capture or paste it."
                        : "Article text unavailable — capture the page."
                      : selectedVideo.valueScore
                        ? selectedVideo.valueReason
                        : "Waiting for transcript analysis."}
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
                    <p>
                      {selectedVideo.analysisStatus === "unavailable"
                        ? selectedVideo.type === "Watch"
                          ? "YouTube could not provide this transcript. Upload the recording or paste the full transcript."
                          : "Article text was not captured. Save it with the extension."
                        : selectedVideo.analysisStatus === "error"
                          ? "Analysis could not run. You can retry with a pasted transcript or recording."
                          : "GPT-5.4 mini will summarize and score this content when the cooldown ends."}
                    </p>
                    {selectedVideo.type === "Watch" ? (
                      <div className="transcript-actions">
                        <input
                          ref={transcriptFileInput}
                          className="transcript-file-input"
                          type="file"
                          accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*,video/mp4,video/webm"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void transcribeFile(selectedVideo.id, file);
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={transcriptBusy !== null}
                          onClick={() => transcriptFileInput.current?.click()}
                        >
                          {transcriptBusy === "upload"
                            ? "Transcribing…"
                            : "Generate transcript"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={transcriptBusy !== null}
                          onClick={() =>
                            setShowTranscriptPaste((current) => !current)
                          }
                        >
                          Paste transcript
                        </button>
                        <span>
                          MP3, MP4, M4A, WAV or WEBM · 25 MB max · Bengali +
                          English
                        </span>
                      </div>
                    ) : null}
                    {showTranscriptPaste ? (
                      <div className="transcript-paste">
                        <textarea
                          aria-label="Full transcript"
                          value={transcriptText}
                          onChange={(event) =>
                            setTranscriptText(event.target.value)
                          }
                          placeholder="Paste the full transcript here. The extension can send this same text directly."
                        />
                        <button
                          type="button"
                          disabled={transcriptBusy !== null}
                          onClick={() =>
                            void analyzePastedTranscript(selectedVideo.id)
                          }
                        >
                          {transcriptBusy === "paste"
                            ? "Analyzing…"
                            : "Save and analyze"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                {selectedAnalysis ? (
                  <div className="analysis-summary">
                    <span
                      className={`recommendation ${selectedAnalysis.recommendation}`}
                    >
                      {selectedAnalysis.recommendation === "summary_only"
                        ? "Skip — summary is enough"
                        : selectedAnalysis.recommendation === "skim"
                          ? "Skim"
                          : selectedVideo.type === "Watch"
                            ? "Worth watching"
                            : "Worth reading"}
                    </span>
                    <MarkdownText content={selectedAnalysis.summary} />
                  </div>
                ) : null}
              </section>

              <section className="properties-panel" aria-label="Item properties">
                <div className="property-row">
                  <span className="property-name">Type</span>
                  <select
                    aria-label="Content type"
                    value={selectedVideo.type}
                    onChange={(event) =>
                      updateVideo(selectedVideo.id, {
                        type: event.target.value as ContentType,
                      })
                    }
                  >
                    <option value="Watch">Watch</option>
                    <option value="Read">Read</option>
                  </select>
                </div>
                <div className="property-row topic-property">
                  <span className="property-name">Topic</span>
                  <div className="property-topics">
                    {topicOptions.map((topic) => (
                      <button
                        type="button"
                        key={topic}
                        aria-pressed={selectedVideo.topics.includes(topic)}
                        className={
                          selectedVideo.topics.includes(topic)
                            ? `property-tag ${topic.toLowerCase()} selected`
                            : `property-tag ${topic.toLowerCase()}`
                        }
                        onClick={() => toggleTopic(selectedVideo.id, topic)}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="property-save-state">
                  {cloudStatus === "synced"
                    ? "Properties synced to D1"
                    : cloudStatus === "syncing"
                      ? "Saving properties…"
                      : "Saved locally; cloud sync will retry"}
                </p>
              </section>

              <section className="notes-panel">
                <div className="section-title">
                  <h3>Working notes</h3>
                  <span>{cloudStatus === "synced" ? "cloud synced" : "saved locally"}</span>
                </div>
                <textarea
                  value={notes[selectedVideo.id] ?? ""}
                  onChange={(event) => {
                    const changedAt = Date.now();
                    setNotes((current) => ({
                      ...current,
                      [selectedVideo.id]: event.target.value,
                    }));
                    setNoteUpdatedAt((current) => ({
                      ...current,
                      [selectedVideo.id]: changedAt,
                    }));
                  }}
                  placeholder="Key ideas, timestamps, decisions, next actions…"
                />
                <div className="knowledge-save-state">
                  <span aria-hidden="true">✦</span>
                  {knowledgeBusyIds.has(selectedVideo.id)
                    ? "Updating your AI learning summary…"
                    : knowledgeSummaries[selectedVideo.id]
                      ? "AI learning summary is active in future novelty scores."
                      : "Write a meaningful note and ReSync will build your learning memory."}
                </div>
              </section>

              <section className="ask-panel">
                <div className="ask-preview">
                  <span>✦</span>
                  <p>
                    Ask for the highest-value ideas, challenge a claim, or turn your
                    notes into actions.
                  </p>
                </div>
                <div className="chat-space" ref={chatMessagesRef}>
                  {chatLoading ? (
                    <p>Loading conversation…</p>
                  ) : chatMessages.length || chatBusy ? (
                    <div className="chat-messages">
                      {chatMessages.map((message) => (
                        <div
                          className={`chat-message ${message.role}`}
                          key={message.id}
                        >
                          <span>
                            {message.role === "user" ? "You" : "ReSync AI"}
                          </span>
                          <MarkdownText
                            content={
                              message.role === "assistant"
                                ? normalizeAssistantMarkdown(message.content)
                                : message.content
                            }
                          />
                        </div>
                      ))}
                      {chatBusy ? (
                        <div className="chat-message assistant pending">
                          <span>ReSync AI</span>
                          <p>Thinking…</p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p>
                      Ask about this{" "}
                      {selectedVideo.type === "Watch" ? "video" : "article"}.
                      ReSync uses the captured source and your notes when
                      available.
                    </p>
                  )}
                </div>
                <form
                  className="ask-input"
                  onSubmit={(event) => void sendChat(event, selectedVideo.id)}
                >
                  <input
                    aria-label="Ask ReSync AI"
                    placeholder={
                      chatBusy
                        ? "Type your next question while ReSync AI thinks…"
                        : `Ask about this ${
                            selectedVideo.type === "Watch" ? "video" : "article"
                          }…`
                    }
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                  />
                  <button
                    aria-label={
                      chatBusy
                        ? "Wait for the current answer before sending"
                        : "Send message"
                    }
                    disabled={chatBusy || !chatInput.trim()}
                  >
                    ↑
                  </button>
                </form>
                <p>
                  Conversations are saved in D1 separately from working notes.
                </p>
              </section>

            </aside>
          </section>
        </div>
      ) : null}
    </main>
  );
}
