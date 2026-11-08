import {
  AuthSettingsWriteScope,
  type EnvironmentId,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import { useState } from "react";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SecretInput } from "./SecretInput";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function ExternalSpeechSettings({
  environmentId,
  onSaved,
}: {
  environmentId: EnvironmentId;
  onSaved: () => void;
}) {
  const { environments } = useEnvironments();
  const environment = environments.find((item) => item.environmentId === environmentId);
  const settings = environment?.serverConfig?.settings;
  const canManage = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const [key, setKey] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  if (!settings) return null;
  const save = (patch: ServerSettingsPatch) => {
    void update({ environmentId, input: { patch } }).then((result) => {
      if (result._tag === "Success") {
        setKey("");
        onSaved();
      }
    });
  };
  const external = settings.speechModelSource === "external";
  return (
    <>
      <SettingsRow
        {...searchableSetting("speech-model-management")}
        title="Model management"
        description={`Choose who runs speech recognition on ${environment?.label ?? "this environment"}.`}
        control={
          <Select
            value={settings.speechModelSource}
            disabled={!canManage}
            onValueChange={(value) => {
              if (value === "managed" || value === "external") save({ speechModelSource: value });
            }}
          >
            <SelectTrigger size="sm" aria-label="Speech model management">
              <SelectValue>{external ? "User managed" : "Managed by T3 Code"}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end">
              <SelectItem value="managed">Managed by T3 Code</SelectItem>
              <SelectItem value="external">User managed</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      {external && (
        <SettingsRow
          title="Speech endpoint"
          description="OpenAI-compatible API base URL, including /v1 when required. Localhost refers to the selected environment. Audio is sent when recording stops; model loading and hardware are managed by your server."
        >
          <div className="grid gap-3 py-3">
            <Input
              aria-label="Speech API base URL"
              placeholder="http://127.0.0.1:8999/v1"
              value={endpoint ?? settings.speechExternalEndpoint}
              disabled={!canManage}
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <Input
              aria-label="Speech endpoint model"
              placeholder="Model ID, e.g. parakeet"
              value={model ?? settings.speechExternalModel}
              disabled={!canManage}
              onChange={(event) => setModel(event.target.value)}
            />
            <SecretInput
              aria-label="Speech endpoint API key"
              placeholder="API key (optional)"
              configured={Boolean(settings.voiceApiCredentials.external)}
              value={key}
              disabled={!canManage}
              onChange={(event) => setKey(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={
                  !canManage ||
                  !(endpoint ?? settings.speechExternalEndpoint).trim() ||
                  !(model ?? settings.speechExternalModel).trim()
                }
                onClick={() =>
                  save({
                    speechExternalEndpoint: (endpoint ?? settings.speechExternalEndpoint).trim(),
                    speechExternalModel: (model ?? settings.speechExternalModel).trim(),
                    ...(key.trim() ? { voiceApiCredentials: { external: key.trim() } } : {}),
                  })
                }
              >
                Save endpoint
              </Button>
              {settings.voiceApiCredentials.external && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => save({ voiceApiCredentials: { external: "" } })}
                >
                  Remove API key
                </Button>
              )}
            </div>
          </div>
        </SettingsRow>
      )}
    </>
  );
}
