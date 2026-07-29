import {
  ensureNormalizedLibrary,
  itemFromRow,
  ItemRow,
} from "../../../db/library";
import { analyzeAndStoreTranscript } from "../../../lib/transcript-analysis";

const TRANSCRIPTION_MODEL = "gpt-transcribe";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
]);

function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(value, { ...init, headers });
}

function fileExtension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const itemId = form.get("itemId");
    const file = form.get("file");
    if (typeof itemId !== "string" || !itemId) {
      return noStoreJson(
        { error: "A valid itemId is required." },
        { status: 400 },
      );
    }
    if (!(file instanceof File) || !file.size) {
      return noStoreJson(
        { error: "Choose an audio or video file to transcribe." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return noStoreJson(
        { error: "The file must be 25 MB or smaller." },
        { status: 413 },
      );
    }
    if (!SUPPORTED_EXTENSIONS.has(fileExtension(file.name))) {
      return noStoreJson(
        { error: "Use MP3, MP4, MPEG, MPGA, M4A, WAV, or WEBM." },
        { status: 415 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return noStoreJson(
        {
          error: "OpenAI API key is not configured.",
          code: "OPENAI_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const d1 = await ensureNormalizedLibrary();
    const row = await d1
      .prepare("SELECT * FROM items WHERE id = ?1")
      .bind(itemId)
      .first<ItemRow>();
    if (!row) {
      return noStoreJson({ error: "ReSync item not found." }, { status: 404 });
    }
    const item = itemFromRow(row);
    if (item.type !== "Watch") {
      return noStoreJson(
        { error: "File transcription is available for Watch items." },
        { status: 400 },
      );
    }

    const transcriptionForm = new FormData();
    transcriptionForm.set("model", TRANSCRIPTION_MODEL);
    transcriptionForm.set("file", file, file.name);
    transcriptionForm.append("languages[]", "bn");
    transcriptionForm.append("languages[]", "en");
    transcriptionForm.set(
      "prompt",
      "A learning video that may switch between Bengali and English and include competitive programming, AI, technology, and business terminology.",
    );

    const transcriptionResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: transcriptionForm,
      },
    );
    if (!transcriptionResponse.ok) {
      const problem = await transcriptionResponse.text();
      throw new Error(
        `OpenAI transcription failed (${transcriptionResponse.status}): ${problem}`,
      );
    }
    const transcription = (await transcriptionResponse.json()) as {
      text?: unknown;
      languages?: Array<{ code?: unknown }>;
    };
    if (typeof transcription.text !== "string" || !transcription.text.trim()) {
      throw new Error("OpenAI returned an empty transcript.");
    }
    const languageCodes = Array.isArray(transcription.languages)
      ? transcription.languages
          .map((language) =>
            typeof language.code === "string" ? language.code : null,
          )
          .filter((code): code is string => Boolean(code))
      : [];

    const result = await analyzeAndStoreTranscript({
      d1,
      item,
      transcript: transcription.text,
      source: "gpt-transcribe",
      languageCodes,
      transcriptionModel: TRANSCRIPTION_MODEL,
    });
    return noStoreJson(result);
  } catch {
    return noStoreJson(
      { error: "Transcription is temporarily unavailable." },
      { status: 503 },
    );
  }
}
