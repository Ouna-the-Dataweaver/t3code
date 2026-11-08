import { it } from "@effect/vitest";
import { DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS } from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, vi } from "vite-plus/test";
import * as ServerSettings from "../serverSettings.ts";
import * as ExternalSpeechApi from "./ExternalSpeechApi.ts";

const layer = (patch: Parameters<typeof ServerSettings.layerTest>[0] = {}) =>
  ExternalSpeechApi.layer.pipe(
    Layer.provideMerge(ServerSettings.layerTest(patch)),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.mock(SecretResolver.SecretResolver)({})),
  );

it.effect("uploads WAV to the configured endpoint with its own model and optional key", () =>
  Effect.gen(function* () {
    const upstream = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("http://127.0.0.1:8999/v1/audio/transcriptions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer local-key");
      const body = init?.body as FormData;
      expect(body.get("model")).toBe("parakeet");
      expect(body.get("language")).toBe("en");
      expect(body.get("file")).toBeInstanceOf(Blob);
      return Response.json({ text: "hello Acmecorp" });
    });
    const api = yield* ExternalSpeechApi.ExternalSpeechApi.pipe(
      Effect.provide(
        layer({
          speechExternalEndpoint: "http://127.0.0.1:8999/v1/",
          speechExternalModel: "parakeet",
          voiceApiCredentials: { external: "local-key" },
        }),
      ),
    );
    const text = yield* api
      .transcribe(new Float32Array([0.25]), {
        ...DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
        speechLanguage: "en",
      })
      .pipe(Effect.provideService(FetchHttpClient.Fetch, upstream));
    expect(text).toBe("hello Acmecorp");
    expect(upstream).toHaveBeenCalledTimes(1);
  }),
);

it.effect("reports endpoint rejection and never follows redirects with credentials", () =>
  Effect.gen(function* () {
    const upstream = vi.fn<typeof fetch>(async (_request, init) => {
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(null, { status: 401 });
    });
    const api = yield* ExternalSpeechApi.ExternalSpeechApi.pipe(
      Effect.provide(
        layer({
          speechExternalEndpoint: "http://127.0.0.1:8999/v1",
          speechExternalModel: "parakeet",
        }),
      ),
    );
    const result = yield* Effect.result(
      api
        .transcribe(new Float32Array([0.25]), DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, upstream)),
    );
    expect(result).toMatchObject({ _tag: "Failure", failure: { reason: "http", status: 401 } });
  }),
);
