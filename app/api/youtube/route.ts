function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "youtu.be" || url.hostname.endsWith("youtube.com");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const videoUrl = new URL(request.url).searchParams.get("url");

  if (!videoUrl || !isYouTubeUrl(videoUrl)) {
    return Response.json({ error: "A valid YouTube URL is required." }, { status: 400 });
  }

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", videoUrl);
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return Response.json({ error: "YouTube metadata was unavailable." }, { status: 502 });
  }

  const metadata = (await response.json()) as {
    title: string;
    author_name: string;
    thumbnail_url?: string;
  };

  return Response.json(
    {
      title: metadata.title,
      channel: metadata.author_name,
      thumbnailUrl: metadata.thumbnail_url,
    },
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}
