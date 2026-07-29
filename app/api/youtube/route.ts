type YouTubeApiVideo = {
  snippet: {
    title: string;
    channelTitle: string;
    description: string;
    publishedAt: string;
    tags?: string[];
    thumbnails?: Record<string, { url: string; width?: number; height?: number }>;
  };
  contentDetails: {
    duration: string;
    caption: "true" | "false";
  };
  status?: {
    embeddable?: boolean;
    privacyStatus?: string;
  };
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function getYouTubeId(value: string) {
  try {
    const url = new URL(value);
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

    return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function durationToSeconds(duration: string) {
  const match = duration.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return 0;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

function bestThumbnail(
  thumbnails?: Record<string, { url: string; width?: number; height?: number }>,
) {
  if (!thumbnails) return undefined;
  return Object.values(thumbnails)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
    ?.url;
}

async function fetchBasicMetadata(videoUrl: string) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", videoUrl);
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) return null;

  const metadata = (await response.json()) as {
    title: string;
    author_name: string;
    thumbnail_url?: string;
  };

  return {
    title: metadata.title,
    channel: metadata.author_name,
    thumbnailUrl: metadata.thumbnail_url,
    durationSeconds: 0,
    durationMinutes: 0,
    description: "",
    publishedAt: null,
    tags: [] as string[],
    captionAvailable: null,
    embeddable: null,
    metadataComplete: false,
    source: "oembed" as const,
  };
}

async function fetchCompleteMetadata(videoId: string, apiKey: string) {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("part", "snippet,contentDetails,status");
  endpoint.searchParams.set("key", apiKey);

  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) return { kind: "api-error" as const };

  const payload = (await response.json()) as { items?: YouTubeApiVideo[] };
  const video = payload.items?.[0];
  if (!video) return { kind: "not-found" as const };

  const durationSeconds = durationToSeconds(video.contentDetails.duration);
  return {
    kind: "complete" as const,
    metadata: {
      title: video.snippet.title,
      channel: video.snippet.channelTitle,
      thumbnailUrl: bestThumbnail(video.snippet.thumbnails),
      durationSeconds,
      durationMinutes: Math.ceil(durationSeconds / 60),
      description: video.snippet.description,
      publishedAt: video.snippet.publishedAt,
      tags: video.snippet.tags ?? [],
      captionAvailable: video.contentDetails.caption === "true",
      embeddable: video.status?.embeddable ?? null,
      metadataComplete: true,
      source: "youtube-data-api" as const,
    },
  };
}

export async function GET(request: Request) {
  const videoUrl = new URL(request.url).searchParams.get("url");
  const videoId = videoUrl ? getYouTubeId(videoUrl) : undefined;

  if (!videoUrl || !videoId) {
    return Response.json(
      { error: "Paste a valid YouTube video link.", code: "INVALID_URL" },
      { status: 400 },
    );
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey) {
    const complete = await fetchCompleteMetadata(videoId, apiKey);
    if (complete.kind === "not-found") {
      return Response.json(
        { error: "This YouTube video does not exist or is not accessible.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    if (complete.kind === "complete") {
      return Response.json(complete.metadata, {
        headers: {
          "cache-control": "public, max-age=3600, s-maxage=86400",
        },
      });
    }
  }

  const basic = await fetchBasicMetadata(videoUrl);
  if (!basic) {
    return Response.json(
      { error: "This YouTube video does not exist or is not accessible.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return Response.json(basic, {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
