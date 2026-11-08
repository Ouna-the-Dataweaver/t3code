import { isSecretReference, type SpeechTranscriptionOptions } from "@t3tools/contracts";
import * as SecretResolver from "@t3tools/secret-provider-core/server/SecretResolver";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import * as ServerSettings from "../serverSettings.ts";
import { requireSettingsSecret } from "../secrets/settingsSecretValue.ts";
import { encodeSpeechWav } from "./wav.ts";

export class ExternalSpeechApiError extends Schema.TaggedError<ExternalSpeechApiError>()(
  "ExternalSpeechApiError",
  {
    reason: Schema.Literals(["configuration", "credential", "http", "response", "unavailable"]),
    status: Schema.optionalKey(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message() {
    return `Speech transcription API failed (${this.reason}${this.status ? ` ${this.status}` : ""}).`;
  }
}

export class ExternalSpeechApi extends Context.Service<
  ExternalSpeechApi,
  {
    readonly transcribe: (
      samples: Float32Array,
      options: SpeechTranscriptionOptions,
    ) => Effect.Effect<string, ExternalSpeechApiError>;
  }
>()("t3/speech/ExternalSpeechApi") {}

const ResponseText = Schema.Struct({ text: Schema.String });

const make = Effect.gen(function* () {
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const resolver = yield* SecretResolver.SecretResolver;
  const http = yield* HttpClient.HttpClient;
  return ExternalSpeechApi.of({
    transcribe: Effect.fn("ExternalSpeechApi.transcribe")(
      function* (samples, options) {
        const settings = yield* settingsService.getSettings.pipe(
          Effect.mapError(
            (cause) => new ExternalSpeechApiError({ reason: "configuration", cause }),
          ),
        );
        if (!settings.speechExternalEndpoint || !settings.speechExternalModel)
          return yield* new ExternalSpeechApiError({ reason: "configuration" });
        const source = settings.voiceApiCredentials.external;
        if (isSecretReference(source)) yield* resolver.invalidate([source]);
        const key = yield* requireSettingsSecret(resolver, source).pipe(
          Effect.mapError((cause) => new ExternalSpeechApiError({ reason: "credential", cause })),
        );
        const form = new FormData();
        form.set("model", settings.speechExternalModel);
        form.set("response_format", "json");
        if (options.speechLanguage !== "auto") form.set("language", options.speechLanguage);
        const words = options.speechCustomWords.map(({ term }) => term);
        if (words.length) form.set("prompt", words.join(", "));
        form.set(
          "file",
          new Blob([encodeSpeechWav(samples)], { type: "audio/wav" }),
          "dictation.wav",
        );
        let request = HttpClientRequest.post(
          `${settings.speechExternalEndpoint.replace(/\/+$/, "")}/audio/transcriptions`,
        ).pipe(HttpClientRequest.bodyFormData(form));
        if (key) request = HttpClientRequest.bearerToken(request, Redacted.make(key));
        const response = yield* http.execute(request).pipe(
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
          Effect.provideService(HttpClient.TracerPropagationEnabled, false),
          Effect.mapError((cause) => new ExternalSpeechApiError({ reason: "unavailable", cause })),
        );
        if (response.status < 200 || response.status >= 300)
          return yield* new ExternalSpeechApiError({ reason: "http", status: response.status });
        return (yield* HttpClientResponse.schemaBodyJson(ResponseText)(response).pipe(
          Effect.mapError((cause) => new ExternalSpeechApiError({ reason: "response", cause })),
        )).text;
      },
      Effect.timeoutOrElse({
        duration: "2 minutes",
        orElse: () => Effect.fail(new ExternalSpeechApiError({ reason: "unavailable" })),
      }),
    ),
  });
});

export const layer = Layer.effect(ExternalSpeechApi, make);
