import { useAtomRefresh } from "@effect/atom-react";
import { AuthSettingsWriteScope, type ServerSettingsPatch } from "@t3tools/contracts";
import { useState } from "react";
import { TextInput, View } from "react-native";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { SecretTextInput } from "../../components/ui/SecretTextInput";
import { SettingsSection } from "./components/SettingsSection";
import { voiceSpeechStatusAtom } from "../voice-input/voiceDestination";

export function ExternalSpeechSection({ environment }: { environment: EnvironmentPresentation }) {
  const settings = environment.serverConfig?.settings;
  const canManage = useEnvironmentScope(environment.environmentId, AuthSettingsWriteScope);
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const refreshStatus = useAtomRefresh(voiceSpeechStatusAtom(environment.environmentId));
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [key, setKey] = useState("");
  if (!settings) return null;
  const external = settings.speechModelSource === "external";
  const save = async (patch: ServerSettingsPatch) => {
    const result = await update({ environmentId: environment.environmentId, input: { patch } });
    if (result._tag === "Success") {
      setKey("");
      refreshStatus();
    }
  };
  return (
    <SettingsSection
      title={`Model management on ${environment.label}`}
      footer={
        external
          ? "OpenAI-compatible base URL, including /v1 when required. Localhost refers to this environment. Finished recordings are sent to your server."
          : undefined
      }
    >
      <ListChoiceRow
        label="Managed by T3 Code"
        selected={!external}
        disabled={!canManage}
        onPress={() => void save({ speechModelSource: "managed" })}
      />
      <ListChoiceRow
        label="User managed"
        selected={external}
        disabled={!canManage}
        separated
        onPress={() => void save({ speechModelSource: "external" })}
      />
      {external && (
        <>
          <View className="gap-3 px-4 py-3">
            <TextInput
              accessibilityLabel="Speech API base URL"
              placeholder="http://127.0.0.1:8999/v1"
              autoCapitalize="none"
              autoCorrect={false}
              editable={canManage}
              value={endpoint ?? settings.speechExternalEndpoint}
              onChangeText={setEndpoint}
              className="rounded-lg border border-border-subtle px-3 py-2 text-foreground"
            />
            <TextInput
              accessibilityLabel="Speech endpoint model"
              placeholder="Model ID"
              autoCapitalize="none"
              autoCorrect={false}
              editable={canManage}
              value={model ?? settings.speechExternalModel}
              onChangeText={setModel}
              className="rounded-lg border border-border-subtle px-3 py-2 text-foreground"
            />
            <SecretTextInput
              accessibilityLabel="Speech endpoint API key"
              placeholder={
                settings.voiceApiCredentials.external ? "Stored API key" : "API key (optional)"
              }
              editable={canManage}
              value={key}
              onChangeText={setKey}
              onSubmitEditing={(value) => {
                if (canManage && value.trim())
                  void save({ voiceApiCredentials: { external: value.trim() } });
              }}
            />
          </View>
          <ListActionRow
            label="Save endpoint"
            disabled={
              !canManage ||
              !(endpoint ?? settings.speechExternalEndpoint).trim() ||
              !(model ?? settings.speechExternalModel).trim()
            }
            onPress={() =>
              void save({
                speechExternalEndpoint: (endpoint ?? settings.speechExternalEndpoint).trim(),
                speechExternalModel: (model ?? settings.speechExternalModel).trim(),
                ...(key.trim() ? { voiceApiCredentials: { external: key.trim() } } : {}),
              })
            }
          />
          {settings.voiceApiCredentials.external && (
            <ListActionRow
              label="Remove endpoint API key"
              disabled={!canManage}
              onPress={() => void save({ voiceApiCredentials: { external: "" } })}
            />
          )}
        </>
      )}
    </SettingsSection>
  );
}
