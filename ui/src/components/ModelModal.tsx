import { ModelInput } from "@coasys/ad4m/lib/src/ai/AIResolver";
import { useContext, useEffect, useState, useRef } from "react";
import { Ad4minContext } from "../context/Ad4minContext";
import "../index.css";

const AITypes = ["LLM", "EMBEDDING", "TRANSCRIPTION"];
const llmModels = [
  "External API",
  // "tiny_llama_1_1b",
  "mistral_7b",
  "mistral_7b_instruct",
  "mistral_7b_instruct_2",
  "solar_10_7b",
  "solar_10_7b_instruct",
  "llama_7b",
  "llama_7b_chat",
  "llama_7b_code",
  "llama_8b",
  "llama_8b_chat",
  "llama_3_1_8b_chat",
  "llama_13b",
  "llama_13b_chat",
  "llama_13b_code",
  "llama_34b_code",
  "llama_70b",
];
const transcriptionModels = ["whisper"];
const embeddingModels = ["bert"];

export default function ModelModal(props: { close: () => void; oldModel?: any }) {
  const { close, oldModel } = props;
  const {
    state: { client },
  } = useContext(Ad4minContext);

  const [newModelName, setNewModelName] = useState("");
  const [newModelNameError, setNewModelNameError] = useState(false);
  const [newModelType, setNewModelType] = useState("LLM");
  const [newModels, setNewModels] = useState<any[]>(llmModels);
  const [newModel, setNewModel] = useState("llama_8b");
  const [apiUrl, setApiUrl] = useState("https://api.openai.com/v1");
  const [apiUrlError, setApiUrlError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiValid, setApiValid] = useState(false);
  const [apiModelValid, setApiModelValid] = useState(false);
  const [apiModelError, setApiModelError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiModel, setApiModel] = useState("");
  const [apiModels, setApiModels] = useState<string[]>([]);
  const apiUrlRef = useRef("https://api.openai.com/v1");
  const apiKeyRef = useRef("");

  function closeMenu(menuId: string) {
    const menu = document.getElementById(menuId);
    const items = menu?.shadowRoot?.querySelector("details");
    if (items) items.open = false;
  }

  async function checkApi() {
    console.log("check api", apiUrlRef.current, apiKeyRef.current);
    setLoading(true);
    setApiKeyError("");
    setApiUrlError("");
    let valid = false;
    try {
      const response = await fetch(`${apiUrlRef.current}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKeyRef.current}`,
          "Content-Type": "application/json",
        },
      });
      const { ok, status, statusText } = response;
      if (ok) valid = true;
      else {
        // key invalid
        setApiKeyError(status === 401 ? "Invalid key" : statusText);
      }
    } catch {
      // url invalid
      setApiUrlError("Error connecting to API");
    }
    setApiValid(valid);

    if (valid) {
      // get models
      setApiModels([]);
      setApiModel("");
      setApiModelValid(false)
      try {
        const response = await fetch(`${apiUrlRef.current}/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKeyRef.current}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const body = await response.json();
          const models = body.data.map((e: any) => e.id);
          setApiModels(models);
          if (apiUrlRef.current === "https://api.openai.com/v1") setApiModel("gpt-4o");
        }
      } catch {}
    } else {
      setApiModels([]);
      setApiModel("");
    }
    setLoading(false);
  }

  async function checkModel() {
    console.log("check model");
    setLoading(true);
    if (apiModel && apiModel != "") {
      try {
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: apiModel,
            messages: [
              {
                role: "user",
                content: "Hi"
              }
            ],
            max_tokens: 5
          })
        });
  
        setLoading(false);
        const { ok, status, statusText } = response;
        if (ok) {
          console.log("API test run successful!")
          setApiModelValid(true);
        } else {
          if(status === 401) {
            setApiKeyError("Invalid Key")
          } else {
            setApiModelError(statusText)
          }
          return false
        }
      } catch (e) {
        setApiModelError(`Error testing API completion: ${e}`);
      }        
    } else {
      setApiModelError("Model required");
    }
    setLoading(false);
  }


  async function saveModel() {
    setLoading(true);
    // validate model settings
    if (!newModelName) setNewModelNameError(true);
    else {
      // create new model
      const model = {
        name: newModelName,
        modelType: newModelType,
      } as ModelInput;
      if (newModel === "External API") {
        model.api = { baseUrl: apiUrl, apiKey, apiType: "OPEN_AI", model: apiModel };
      } else {
        model.local = {
          fileName: newModel,
          tokenizerSource: "",
          modelParameters: "",
        };
      }
      if (oldModel) client!.ai.updateModel(oldModel.id, model);
      else {
        const newModelId = await client!.ai.addModel(model);
        // if no default LLM set, mark new model as default
        const defaultLLM = await client!.ai.getDefaultModel("LLM");
        if (!defaultLLM) client!.ai.setDefaultModel("LLM", newModelId);
      }
      close();
    }
    setLoading(false);
  }

  useEffect(() => {
    if (oldModel) {
      setNewModelName(oldModel.name);
      setNewModelType(oldModel.modelType);

      if (oldModel.modelType === "LLM") {
        setNewModels(llmModels);
        setNewModel(oldModel.api ? "External API" : oldModel.local.fileName);
      } else if (oldModel.modelType === "EMBEDDING") {
        setNewModels(embeddingModels);
        setNewModel(oldModel.local.fileName);
      } else {
        setNewModels(transcriptionModels);
        setNewModel(oldModel.local.fileName);
      }

      if (oldModel.api) {
        setApiUrl(oldModel.api.baseUrl);
        apiUrlRef.current = oldModel.api.baseUrl;
        setApiKey(oldModel.api.apiKey);
        apiKeyRef.current = oldModel.api.apiKey;
      }
    }
  }, []);

  return (
    <j-modal
      open
      onToggle={(e: any) => {
        if (!e.target.open) close();
      }}
    >
      <j-box px="100">
        <j-flex direction="column" a="center" gap="700">
          <j-text size="700" color="ui-0">
            {oldModel ? "Edit" : "Add a new"} model
          </j-text>

          <j-flex direction="column" a="center" gap="500">
            <j-flex gap="400">
              <j-input
                size="md"
                type="text"
                label="Name"
                value={newModelName}
                error={newModelNameError}
                errortext="Required"
                onInput={(e: any) => {
                  setNewModelNameError(false);
                  setNewModelName(e.target.value);
                }}
              />
              {newModelNameError && (
                <j-icon name="x-circle" color="danger-500" style={{ marginTop: 26 }} />
              )}
            </j-flex>

            {!oldModel && (
              <j-flex a="center" gap="400">
                <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                  Type:
                </j-text>
                <j-menu style={{ height: 42, zIndex: 3 }}>
                  <j-menu-group collapsible title={newModelType} id="ai-types">
                    {AITypes.map((type) => (
                      <j-menu-item
                        selected={newModelType === type}
                        onClick={() => {
                          setNewModelType(type);
                          if (type === "LLM") {
                            setNewModels(llmModels);
                            setNewModel("llama_8b");
                          } else if (type === "EMBEDDING") {
                            setNewModels(embeddingModels);
                            setNewModel("bert");
                          } else {
                            setNewModels(transcriptionModels);
                            setNewModel("whisper");
                          }
                          closeMenu("ai-types");
                        }}
                      >
                        {type}
                      </j-menu-item>
                    ))}
                  </j-menu-group>
                </j-menu>
              </j-flex>
            )}

            <j-flex a="center" gap="400">
              <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                Model:
              </j-text>
              <j-menu style={{ zIndex: 2 }}>
                <j-menu-group collapsible title={newModel} id="new-models">
                  {newModels.map((model) => (
                    <j-menu-item
                      selected={newModel === model}
                      onClick={() => {
                        setNewModel(model);
                        closeMenu("new-models");
                      }}
                    >
                      {model}
                    </j-menu-item>
                  ))}
                </j-menu-group>
              </j-menu>
            </j-flex>

            {newModel === "External API" && (
              <>
                <j-flex a="center" gap="400">
                  <j-button
                    onClick={() => {
                      setApiUrl("https://api.openai.com/v1");
                      apiUrlRef.current = "https://api.openai.com/v1";
                      setApiValid(false);
                      setApiModelValid(false);
                      setApiKeyError("");
                      setApiUrlError("");
                    }}
                  >
                    OpenAI
                  </j-button>
                  <j-button
                    onClick={() => {
                      setApiUrl("http://localhost:11434/v1");
                      apiUrlRef.current = "http://localhost:11434/v1";
                      setApiValid(false);
                      setApiModelValid(false);
                      setApiKeyError("");
                      setApiUrlError("");
                    }}
                  >
                    Ollama
                  </j-button>
                </j-flex>

                <j-flex a="center" gap="400">
                  <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                    API URL:
                  </j-text>
                  <j-input
                    size="md"
                    type="text"
                    value={apiUrl}
                    error={!!apiUrlError}
                    errortext={apiUrlError}
                    onInput={(e: any) => {
                      setApiUrl(e.target.value);
                      apiUrlRef.current = e.target.value;
                      setApiValid(false);
                      setApiKeyError("");
                      setApiUrlError("");
                    }}
                    style={{ width: "100%" }}
                  />
                  {apiUrlError && <j-icon name="x-circle" color="danger-500" />}
                  {apiValid && <j-icon name="check-circle" color="success-500" />}
                </j-flex>

                <j-flex a="center" gap="400">
                  <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                    API Key:
                  </j-text>
                  <j-input
                    size="md"
                    type="text"
                    value={apiKey}
                    error={!!apiKeyError}
                    errortext={apiKeyError}
                    onInput={(e: any) => {
                      setApiKey(e.target.value);
                      apiKeyRef.current = e.target.value;
                      setApiValid(false);
                      setApiKeyError("");
                      setApiUrlError("");
                    }}
                    style={{ width: "100%" }}
                  />
                  {apiKeyError && <j-icon name="x-circle" color="danger-500" />}
                  {apiValid && <j-icon name="check-circle" color="success-500" />}
                </j-flex>

                {apiValid && (
                  <j-flex direction="column" a="center" gap="400">
                    <j-flex a="center" gap="400">
                      <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                        API Model:
                      </j-text>
                      <j-menu style={{ zIndex: 2 }}>
                        <j-menu-group
                          collapsible
                          title={apiModel || "None selected"}
                          id="api-models"
                        >
                          {apiModels.map((model) => (
                            <j-menu-item
                              selected={model === apiModel}
                              onClick={() => {
                                setApiModelError("");
                                setApiModel(model);
                                closeMenu("api-models");
                              }}
                            >
                              {model}
                            </j-menu-item>
                          ))}
                        </j-menu-group>
                      </j-menu>
                      {apiModelError && <j-icon name="x-circle" color="danger-500" />}
                      {apiModelValid && <j-icon name="check-circle" color="success-500" />}
                    </j-flex>

                    {apiModelError && (
                      <j-text color="danger-500" nomargin>
                        {apiModelError}
                      </j-text>
                    )}
                  </j-flex>
                )}
              </>
            )}
          </j-flex>

          {newModel === "External API" && (!apiModelValid || !apiValid) ? (
            <>
              {!apiValid ? (
                <j-button onClick={checkApi} variant="primary" loading={loading}>
                  Check API
                </j-button>
              ) : (
                <j-button onClick={checkModel} variant="primary" loading={loading}>
                  Check Model
                </j-button>
              )}
            </>
          ) : (
            <j-button onClick={saveModel} variant="primary" loading={loading}>
              Save Model
            </j-button>
          )}
        </j-flex>
      </j-box>
    </j-modal>
  );
}
