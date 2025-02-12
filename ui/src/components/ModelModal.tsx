import { ModelInput } from "@coasys/ad4m/lib/src/ai/AIResolver";
import { useContext, useEffect, useState, useRef } from "react";
import { Ad4minContext } from "../context/Ad4minContext";
import "../index.css";

const AITypes = ["LLM", "EMBEDDING", "TRANSCRIPTION"];
const llmModels = [
  "External API",
  "Custom Hugging Face Model",
  "Qwen2.5.1-Coder-7B-Instruct",
  "deepseek_r1_distill_qwen_1_5b",
  "deepseek_r1_distill_qwen_7b",
  "deepseek_r1_distill_qwen_14b",
  "deepseek_r1_distill_llama_8b",
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
const transcriptionModels = [
  "whisper_tiny",
  "whisper_tiny_quantized",
  "whisper_tiny_en",
  "whisper_tiny_en_quantized",
  "whisper_base",
  "whisper_base_en",
  "whisper_small",
  "whisper_small_en",
  "whisper_medium",
  "whisper_medium_en",
  "whisper_medium_en_quantized_distil",
  "whisper_large",
  "whisper_large_v2",
  "whisper_distil_medium_en",
  "whisper_distil_large_v2",
  "whisper_distil_large_v3",
  "whisper_distil_large_v3_quantized",
  "whisper_large_v3_turbo_quantized"
];
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
  const [useCustomTokenizer, setUseCustomTokenizer] = useState(false);
  const [customHfModel, setCustomHfModel] = useState({
    huggingfaceRepo: "",
    revision: "main",
    fileName: "",
    tokenizerSource: {
      repo: "",
      revision: "main",
      fileName: ""
    }
  });

  function closeMenu(menuId: string) {
    const menu = document.getElementById(menuId);
    const items = menu?.shadowRoot?.querySelector("details");
    if (items) items.open = false;
  }

  async function checkApi() {
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
      setApiModelValid(false);
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
    setLoading(true);
    if (apiModel) {
      try {
        const response = await fetch(`${apiUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: apiModel,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });
        setLoading(false);
        const { ok, status, statusText } = response;
        if (ok) {
          setApiModelValid(true);
        } else {
          if (status === 401) setApiKeyError("Invalid Key");
          else setApiModelError(statusText);
          return false;
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
        model.api = {
          baseUrl: apiUrl,
          apiKey,
          apiType: "OPEN_AI",
          model: apiModel,
        };
      } else if (newModel === "Custom Hugging Face Model") {
        model.local = {
          fileName: customHfModel.fileName,
          huggingfaceRepo: customHfModel.huggingfaceRepo,
          revision: customHfModel.revision,
          tokenizerSource: useCustomTokenizer ? customHfModel.tokenizerSource : undefined
        };
      } else {
        model.local = {
          fileName: newModel,
        };
      }
      if (oldModel) client!.ai.updateModel(oldModel.id, model);
      else {
        const newModelId = await client!.ai.addModel(model);
        // if no default LLM set, mark new model as default
        if (newModelType === "LLM") {
          const defaultLLM = await client!.ai.getDefaultModel("LLM");
          if (!defaultLLM) client!.ai.setDefaultModel("LLM", newModelId);
        }
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
        if (oldModel.api) {
          setNewModel("External API");
          setApiUrl(oldModel.api.baseUrl);
          apiUrlRef.current = oldModel.api.baseUrl;
          setApiKey(oldModel.api.apiKey);
          apiKeyRef.current = oldModel.api.apiKey;
        } else if (oldModel.local?.huggingfaceRepo) {
          setNewModel("Custom Hugging Face Model");
          setCustomHfModel({
            huggingfaceRepo: oldModel.local.huggingfaceRepo,
            revision: oldModel.local.revision || "main",
            fileName: oldModel.local.fileName,
            tokenizerSource: oldModel.local.tokenizerSource || {
              repo: "",
              revision: "main",
              fileName: ""
            }
          });
          setUseCustomTokenizer(!!oldModel.local.tokenizerSource);
        } else {
          setNewModel(oldModel.local.fileName);
        }
      } else if (oldModel.modelType === "EMBEDDING") {
        setNewModels(embeddingModels);
        setNewModel(oldModel.local.fileName);
      } else {
        setNewModels(transcriptionModels);
        setNewModel(oldModel.local.fileName || "whisper_small");
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
                            setNewModel("whisper_small");
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

            {newModel === "Custom Hugging Face Model" && (
              <j-flex direction="column" gap="400">
                <j-text nomargin color="ui-0" size="300">
                  Note: The model file must be a GGUF file format, which typically includes the tokenizer.
                </j-text>

                <j-flex a="center" gap="400">
                  <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                    Repository:
                  </j-text>
                  <j-input
                    size="md"
                    type="text"
                    placeholder="e.g., TheBloke/Llama-2-7B-GGUF"
                    value={customHfModel.huggingfaceRepo}
                    onInput={(e: any) => setCustomHfModel({
                      ...customHfModel,
                      huggingfaceRepo: e.target.value
                    })}
                    style={{ width: "100%" }}
                  />
                </j-flex>

                <j-flex a="center" gap="400">
                  <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                    Branch/Revision:
                  </j-text>
                  <j-input
                    size="md"
                    type="text"
                    placeholder="main"
                    value={customHfModel.revision}
                    onInput={(e: any) => setCustomHfModel({
                      ...customHfModel,
                      revision: e.target.value
                    })}
                    style={{ width: "100%" }}
                  />
                </j-flex>

                <j-flex a="center" gap="400">
                  <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                    Filename:
                  </j-text>
                  <j-input
                    size="md"
                    type="text"
                    placeholder="e.g., llama-2-7b.Q4_K_M.gguf"
                    value={customHfModel.fileName}
                    onInput={(e: any) => setCustomHfModel({
                      ...customHfModel,
                      fileName: e.target.value
                    })}
                    style={{ width: "100%" }}
                  />
                </j-flex>

                <j-flex a="center" gap="400">
                  <j-checkbox
                    checked={useCustomTokenizer}
                    onChange={(e: any) => setUseCustomTokenizer(e.target.checked)}
                  >
                    Use Custom Tokenizer (Optional)
                  </j-checkbox>
                </j-flex>

                {useCustomTokenizer && (
                  <j-box pl="400">
                    <j-flex direction="column" gap="400">
                      <j-flex a="center" gap="400">
                        <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                          Tokenizer Repo:
                        </j-text>
                        <j-input
                          size="md"
                          type="text"
                          placeholder="e.g., TheBloke/Llama-2-7B-GGUF"
                          value={customHfModel.tokenizerSource.repo}
                          onInput={(e: any) => setCustomHfModel({
                            ...customHfModel,
                            tokenizerSource: {
                              ...customHfModel.tokenizerSource,
                              repo: e.target.value
                            }
                          })}
                          style={{ width: "100%" }}
                        />
                      </j-flex>

                      <j-flex a="center" gap="400">
                        <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                          Tokenizer Branch:
                        </j-text>
                        <j-input
                          size="md"
                          type="text"
                          placeholder="main"
                          value={customHfModel.tokenizerSource.revision}
                          onInput={(e: any) => setCustomHfModel({
                            ...customHfModel,
                            tokenizerSource: {
                              ...customHfModel.tokenizerSource,
                              revision: e.target.value
                            }
                          })}
                          style={{ width: "100%" }}
                        />
                      </j-flex>

                      <j-flex a="center" gap="400">
                        <j-text nomargin color="ui-800" style={{ flexShrink: 0 }}>
                          Tokenizer File:
                        </j-text>
                        <j-input
                          size="md"
                          type="text"
                          placeholder="e.g., tokenizer.json"
                          value={customHfModel.tokenizerSource.fileName}
                          onInput={(e: any) => setCustomHfModel({
                            ...customHfModel,
                            tokenizerSource: {
                              ...customHfModel.tokenizerSource,
                              fileName: e.target.value
                            }
                          })}
                          style={{ width: "100%" }}
                        />
                      </j-flex>
                    </j-flex>
                  </j-box>
                )}
              </j-flex>
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
