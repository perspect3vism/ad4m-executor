use self::{audio_stream::AudioStream, error::AIServiceError};
use crate::graphql::graphql_types::ModelInput;
#[allow(unused_imports)]
use crate::graphql::graphql_types::{AIModelLoadingStatus, AITaskInput, TranscriptionTextFilter};
use crate::pubsub::AI_MODEL_LOADING_STATUS;
#[allow(unused_imports)]
use crate::pubsub::AI_TRANSCRIPTION_TEXT_TOPIC;
use crate::types::{AITask, LocalModel, Model, ModelType};
use crate::{db::Ad4mDb, pubsub::get_global_pubsub};
use anyhow::anyhow;
use candle_core::Device;
use chat_gpt_lib_rs::{ChatGPTClient, ChatInput, Message, Role};
use deno_core::error::AnyError;
use futures::{FutureExt, SinkExt};
use holochain::test_utils::itertools::Itertools;
use kalosm::language::*;
use kalosm::sound::TextStream;
use kalosm::sound::*;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::sleep;

mod audio_stream;
mod error;
use log::error;

pub type Result<T> = std::result::Result<T, AnyError>;

static WHISPER_MODEL: WhisperSource = WhisperSource::Small;

lazy_static! {
    static ref AI_SERVICE: Arc<Mutex<Option<AIService>>> = Arc::new(Mutex::new(None));
}

struct TranscriptionSession {
    samples_tx: futures_channel::mpsc::UnboundedSender<Vec<f32>>,
    drop_tx: oneshot::Sender<()>,
}

#[derive(Clone)]
pub struct AIService {
    embedding_channel: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<EmbeddingRequest>>>>,
    llm_channel: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<LLMTaskRequest>>>>,
    transcription_streams: Arc<Mutex<HashMap<String, TranscriptionSession>>>,
}

struct EmbeddingRequest {
    pub prompt: String,
    pub result_sender: oneshot::Sender<Result<Vec<f32>>>,
}

#[allow(dead_code)]
#[derive(Debug)]
struct LLMTaskSpawnRequest {
    pub task: AITask,
    pub result_sender: oneshot::Sender<Result<()>>,
}

#[allow(dead_code)]
#[derive(Debug)]
struct LLMTaskPromptRequest {
    pub task_id: String,
    pub prompt: String,
    pub result_sender: oneshot::Sender<Result<String>>,
}

#[allow(dead_code)]
#[derive(Debug)]
struct LLMTaskRemoveRequest {
    pub task_id: String,
    pub result_sender: oneshot::Sender<()>,
}

#[allow(dead_code)]
#[derive(Debug)]
struct LLMTaskShutdownRequest {
    pub result_sender: oneshot::Sender<()>,
}

#[allow(dead_code)]
#[derive(Debug)]
enum LLMTaskRequest {
    Spawn(LLMTaskSpawnRequest),
    Prompt(LLMTaskPromptRequest),
    Remove(LLMTaskRemoveRequest),
    Shutdown(LLMTaskShutdownRequest),
}

enum LlmModel {
    Local(Llama),
    Remote((ChatGPTClient, String)),
}

async fn publish_model_status(
    model_name: String,
    progress: f32,
    status: &str,
    downloaded: bool,
    loaded: bool,
) {
    let model = AIModelLoadingStatus {
        model: model_name.clone(),
        progress: progress as f64,
        status: status.to_string(),
        downloaded,
        loaded,
    };

    let _ = Ad4mDb::with_global_instance(|db| {
        let model = model.clone();
        db.create_or_update_model_status(
            &model.model,
            model.progress,
            &model.status,
            model.downloaded,
            model.loaded,
        )
    });

    get_global_pubsub()
        .await
        .publish(
            &AI_MODEL_LOADING_STATUS,
            &serde_json::to_string(&model).expect("AIModelLoading must be serializable"),
        )
        .await;
}

async fn handle_progress(model_id: String, loading: ModelLoadingProgress) {
    let progress = loading.progress() * 100.0;
    let status = if progress < 100.0 {
        "Loading".to_string()
    } else {
        "Loaded".to_string()
    };
    //println!("Progress update: {}% for model {}", progress, model_id); // Add logging
    publish_model_status(model_id.clone(), progress, &status, false, false).await;
}

impl AIService {
    pub fn new() -> Result<Self> {
        let service = AIService {
            embedding_channel: Arc::new(Mutex::new(HashMap::new())),
            llm_channel: Arc::new(Mutex::new(HashMap::new())),
            transcription_streams: Arc::new(Mutex::new(HashMap::new())),
        };

        let clone = service.clone();
        tokio::spawn(async move {
            if let Err(e) = clone.load().await {
                error!("AIService error while loading models: {:?}", e);
            }
        });

        Ok(service)
    }

    pub async fn load(&self) -> Result<()> {
        // Get all models
        let models = Ad4mDb::with_global_instance(|db| db.get_models())?;

        // Create a future for each, initialzing that model
        let mut futures: Vec<Pin<Box<dyn Future<Output = ()> + Send>>> = vec![];

        if models.is_empty() {
            // for integration tests, make sure we have Bert loaded
            futures.push(Box::pin(
                self.init_model(Model {
                    id: "bert-id".to_string(),
                    name: "bert".to_string(),
                    model_type: ModelType::Embedding,
                    local: Some(LocalModel {
                        file_name: "bert".to_string(),
                        tokenizer_source: None,
                        huggingface_repo: None,
                        revision: None,
                    }),
                    api: None,
                })
                .map(|_| ()),
            ));
        } else {
            for model in models.into_iter() {
                futures.push(Box::pin(async move {
                    if let Err(e) = self.init_model(model.clone()).await {
                        error!("Error initializing model[{:?}]: {:?}", model, e);
                    }
                }));
            }
        }

        // Wait for all initialization futures in parallel
        futures::future::join_all(futures).await;

        // Spawn tasks from the database
        let tasks = Ad4mDb::with_global_instance(|db| db.get_tasks())
            .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;

        for task in tasks {
            self.spawn_task(task).await?;
        }

        Ok(())
    }

    async fn init_model(&self, model: crate::types::Model) -> Result<()> {
        match model.model_type {
            ModelType::Llm => self.spawn_llm_model(model, None).await?,
            ModelType::Embedding => self.spawn_embedding_model(model).await,
            ModelType::Transcription => Self::load_transcriber_model(model.id.clone()).await,
        };
        Ok(())
    }

    pub async fn add_model(&self, model: ModelInput) -> Result<String> {
        let model = Ad4mDb::with_global_instance(|db| {
            let id = db.add_model(&model)?;
            db.get_model(id)
        })
        .map_err(|e| anyhow::anyhow!("{}", e))?
        .expect("since we just added it");
        self.init_model(model.clone()).await?;
        Ok(model.id)
    }

    pub async fn set_default_model(&self, model_type: ModelType, model_id: String) -> Result<()> {
        if ModelType::Llm == model_type {
            Ad4mDb::with_global_instance(|db| db.set_default_model(model_type, &model_id))?;

            // Respawn task on new default model
            let tasks = Ad4mDb::with_global_instance(|db| db.get_tasks())
                .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;

            for task in tasks.into_iter().filter(|t| t.model_id == "default") {
                self.spawn_task(task).await?;
            }
        };
        Ok(())
    }

    pub async fn model_status(model_id: String) -> Result<AIModelLoadingStatus> {
        let status = Ad4mDb::with_global_instance(|db| db.get_model_status(&model_id))
            .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?
            .ok_or(AIServiceError::ModelNotFound)?;

        Ok(status)
    }

    pub async fn init_global_instance() -> Result<()> {
        let new_service = AIService::new()?;
        let mut ai_service = AI_SERVICE.lock().await;
        *ai_service = Some(new_service);
        Ok(())
    }

    pub async fn global_instance() -> Result<AIService> {
        AI_SERVICE
            .lock()
            .await
            .clone()
            .ok_or(anyhow!(AIServiceError::ServiceNotInitialized))
    }

    // -------------------------------------
    // LLM
    // -------------------------------------

    fn new_candle_device() -> Device {
        let non_accelerated_message = "Could not get accelerated Candle device. Defaulting to CPU.";
        if cfg!(feature = "cuda") {
            Device::new_cuda(0).unwrap_or_else(|e| {
                println!("{} {:?}", non_accelerated_message, e);
                error!("{} {:?}", non_accelerated_message, e);
                Device::Cpu
            })
        } else if cfg!(feature = "metal") {
            Device::new_metal(0).unwrap_or_else(|e| {
                println!("{} {:?}", non_accelerated_message, e);
                error!("{} {:?}", non_accelerated_message, e);
                Device::Cpu
            })
        } else {
            Device::Cpu
        }
    }
    async fn build_local_llama(model_id: String, model_config: LocalModel) -> Result<Llama> {
        publish_model_status(model_id.clone(), 0.0, "Loading", false, false).await;
        let llama = Llama::builder().with_source(match model_config.file_name.as_str() {
            // First check model name shortcuts
            "Qwen2.5.1-Coder-7B-Instruct" => LlamaSource::new(FileSource::huggingface(
                "bartowski/Qwen2.5.1-Coder-7B-Instruct-GGUF".to_string(),
                "main".to_string(),
                "Qwen2.5.1-Coder-7B-Instruct-Q4_K_M.gguf".to_string(),
            )),
            "deepseek_r1_distill_qwen_1_5b" => LlamaSource::deepseek_r1_distill_qwen_1_5b(),
            "deepseek_r1_distill_qwen_7b" => LlamaSource::deepseek_r1_distill_qwen_7b(),
            "deepseek_r1_distill_qwen_14b" => LlamaSource::deepseek_r1_distill_qwen_14b(),
            "deepseek_r1_distill_llama_8b" => LlamaSource::deepseek_r1_distill_llama_8b(),
            "llama_tiny" => LlamaSource::tiny_llama_1_1b(),
            "llama_tiny_1_1b_chat" => LlamaSource::tiny_llama_1_1b_chat(),
            "llama_7b" => LlamaSource::llama_7b(),
            "llama_7b_chat" => LlamaSource::llama_7b_chat(),
            "llama_7b_code" => LlamaSource::llama_7b_code(),
            "llama_8b" => LlamaSource::llama_8b(),
            "llama_8b_chat" => LlamaSource::llama_8b_chat(),
            "llama_3_1_8b_chat" => LlamaSource::llama_3_1_8b_chat(),
            "llama_13b" => LlamaSource::llama_13b(),
            "llama_13b_chat" => LlamaSource::llama_13b_chat(),
            "llama_13b_code" => LlamaSource::llama_13b_code(),
            "llama_34b_code" => LlamaSource::llama_34b_code(),
            "llama_70b" => LlamaSource::llama_70b(),
            "mistral_7b" => LlamaSource::mistral_7b(),
            "mistral_7b_instruct" => LlamaSource::mistral_7b_instruct(),
            "mistral_7b_instruct_2" => LlamaSource::mistral_7b_instruct_2(),
            "solar_10_7b" => LlamaSource::solar_10_7b(),
            "solar_10_7b_instruct" => LlamaSource::solar_10_7b_instruct(),

            // Handle unknown models
            _ => {
                if let Some(repo) = model_config.huggingface_repo.clone() {
                    log::info!("Trying to load model from Huggingface:\n
                        model_config.file_name: {:?}\n
                        model_config.huggingface_repo: {:?}\n
                        model_config.revision: {:?}", model_config.file_name, model_config.huggingface_repo, model_config.revision);
                    let mut builder = LlamaSource::new(FileSource::huggingface(
                        repo,
                        model_config.revision.unwrap_or("main".to_string()),
                        model_config.file_name,
                    ));
                    if let Some(tokenizer_source) = model_config.tokenizer_source {
                        log::info!("Trying to load tokenizer from Huggingface:\n
                            tokenizer_source.repo: {:?}\n
                            tokenizer_source.revision: {:?}\n
                            tokenizer_source.file_name: {:?}", tokenizer_source.repo, tokenizer_source.revision, tokenizer_source.file_name);
                        builder = builder.with_tokenizer(FileSource::huggingface(
                            tokenizer_source.repo,
                            tokenizer_source.revision,
                            tokenizer_source.file_name,
                        ));
                    }
                    builder
                } else {
                    log::error!(
                        "Unknown model string: {} and no Huggingface repo provided. Don't know where to get model weights from for: {}", 
                        model_config.file_name,
                        model_id
                    );
                    return Err(anyhow::anyhow!(
                        "Unknown model string: {} and no Huggingface repo provided. Don't know where to get model weights from for: {}", 
                        model_config.file_name,
                        model_id
                    ));
                }
            }
        });

        // Build the local Llama model
        let llama = llama
            .with_device(Self::new_candle_device())
            .build_with_loading_handler({
                let model_id = model_id.clone();
                move |progress| {
                    tokio::spawn(handle_progress(model_id.clone(), progress));
                }
            })
            .await?;

        publish_model_status(model_id.clone(), 100.0, "Downloaded", true, false).await;

        Ok(llama)
    }

    async fn build_remote_client(
        model_id: String,
        api_key: String,
        base_url: Url,
    ) -> ChatGPTClient {
        let mut url = base_url;
        if let Some(segments) = url.path_segments() {
            if segments.clone().next() == Some("v1") {
                url.set_path(&segments.skip(1).collect::<Vec<_>>().join("/"));
            }
        }
        publish_model_status(model_id.clone(), 0.0, "Initializing", false, false).await;
        let client = ChatGPTClient::new(&api_key, url.as_ref());
        publish_model_status(model_id.clone(), 100.0, "Initializing", true, false).await;
        client
    }

    async fn spawn_llm_model(
        &self,
        model_config: crate::types::Model,
        model_ready_sender: Option<oneshot::Sender<()>>,
    ) -> Result<()> {
        if model_config.local.is_none() && model_config.api.is_none() {
            return Err(anyhow!(
                "AI model definition {} doesn't have a body, nothing to spawn!",
                model_config.name
            ));
        }

        let (llama_tx, mut llama_rx) = mpsc::unbounded_channel::<LLMTaskRequest>();
        self.llm_channel
            .lock()
            .await
            .insert(model_config.id.clone(), llama_tx);
        thread::spawn({
            move || {
                let model_id = model_config.id.clone();
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(publish_model_status(
                    model_config.id.clone(),
                    100.0,
                    "Spawning model thread...",
                    true,
                    false,
                ));
                let maybe_model = rt
                    .block_on(async {
                        if let Some(local_model) = model_config.local {
                            Self::build_local_llama(model_id, local_model)
                                .await
                                .map(LlmModel::Local)
                        } else if let Some(api) = model_config.api {
                            Ok(LlmModel::Remote((
                                Self::build_remote_client(model_id, api.api_key, api.base_url).await,
                                api.model
                            )))
                        } else {
                            Err(anyhow!("AI model definition {} doesn't have a body, and this error should have been caught above", model_config.name))
                        }
                    });

                let mut model = match maybe_model {
                    Ok(m) => m,
                    Err(e) => {
                        error!("Failed to build LLM model: {}", e);
                        rt.block_on(publish_model_status(
                            model_config.id.clone(),
                            100.0,
                            &format!("Failed to build LLM model: {}", e),
                            true,
                            false,
                        ));
                        return;
                    }
                };

                let mut tasks = HashMap::<String, Task<Llama>>::new();
                let mut task_descriptions = HashMap::<String, AITask>::new();
                let idle_delay = Duration::from_millis(1);

                rt.block_on(publish_model_status(
                    model_config.id.clone(),
                    100.0,
                    "Ready",
                    true,
                    true,
                ));

                if let Some(model_ready_sender) = model_ready_sender {
                    let _ = model_ready_sender.send(());
                }

                loop {
                    match rt.block_on(async {
                        tokio::select! {
                            recv = llama_rx.recv() => Ok(recv),
                            _ = tokio::time::sleep(idle_delay) => Err("timeout"),
                        }
                    }) {
                        Err(_timeout) => std::thread::sleep(idle_delay * 5),
                        Ok(None) => break,
                        Ok(Some(task_request)) => match task_request {
                            LLMTaskRequest::Shutdown(shutdown_request) => {
                                rt.block_on(publish_model_status(
                                    model_config.id.clone(),
                                    100.0,
                                    "Shutting down",
                                    true,
                                    false,
                                ));

                                // Send confirmation before breaking
                                let _ = shutdown_request.result_sender.send(());
                                break;
                            }
                            LLMTaskRequest::Spawn(spawn_request) => match model {
                                LlmModel::Remote(_) => {
                                    task_descriptions.insert(
                                        spawn_request.task.task_id.clone(),
                                        spawn_request.task,
                                    );
                                    let _ = spawn_request.result_sender.send(Ok(()));
                                }
                                LlmModel::Local(ref mut llama) => {
                                    rt.block_on(publish_model_status(
                                        model_config.id.clone(),
                                        100.0,
                                        "Spawning task...",
                                        true,
                                        true,
                                    ));
                                    let task_description = spawn_request.task;

                                    let task = llama
                                        .task(task_description.system_prompt.clone())
                                        .with_examples(
                                            task_description
                                                .prompt_examples
                                                .clone()
                                                .into_iter()
                                                .map(|example| (example.input, example.output))
                                                .collect::<Vec<(String, String)>>(),
                                        );

                                    rt.block_on(task.run("Test example prompt").all_text());

                                    tasks.insert(task_description.task_id.clone(), task);
                                    let _ = spawn_request.result_sender.send(Ok(()));

                                    rt.block_on(publish_model_status(
                                        model_config.id.clone(),
                                        100.0,
                                        "Ready",
                                        true,
                                        true,
                                    ));
                                }
                            },

                            LLMTaskRequest::Prompt(prompt_request) => match model {
                                LlmModel::Remote((ref mut remote_client, ref model_string)) => {
                                    if let Some(task) =
                                        task_descriptions.get(&prompt_request.task_id)
                                    {
                                        // System prompt
                                        let mut messages = vec![Message {
                                            role: Role::System,
                                            content: task.system_prompt.clone(),
                                        }];

                                        // Examples
                                        for example in task.prompt_examples.iter() {
                                            messages.push(Message {
                                                role: Role::User,
                                                content: example.input.clone(),
                                            });
                                            messages.push(Message {
                                                role: Role::Assistant,
                                                content: example.output.clone(),
                                            })
                                        }

                                        // Prompt
                                        messages.push(Message {
                                            role: Role::User,
                                            content: prompt_request.prompt,
                                        });

                                        let chat_input = ChatInput {
                                            model: chat_gpt_lib_rs::Model::Custom(
                                                model_string.clone(),
                                            ),
                                            messages,
                                            ..Default::default()
                                        };

                                        match rt.block_on(remote_client.chat(chat_input)) {
                                            Err(e) => {
                                                let _ = prompt_request.result_sender.send(Err(
                                                    anyhow!(
                                                        "Error connecting to remote LLM API: {:?}",
                                                        e
                                                    ),
                                                ));
                                            }
                                            Ok(response) => {
                                                let result = response
                                                    .choices
                                                    .first()
                                                    .map(|choice| choice.message.content.clone())
                                                    .ok_or(anyhow!("Got response with no choice"));

                                                let _ = prompt_request.result_sender.send(result);
                                            }
                                        }
                                    } else {
                                        let _ = prompt_request.result_sender.send(Err(anyhow!(
                                            "Task with ID {} not spawned",
                                            prompt_request.task_id
                                        )));
                                    }
                                }
                                LlmModel::Local(_) => {
                                    if let Some(task) = tasks.get(&prompt_request.task_id) {
                                        rt.block_on(publish_model_status(
                                            model_config.id.clone(),
                                            100.0,
                                            "Running inference...",
                                            true,
                                            true,
                                        ));

                                        let result = rt.block_on(async {
                                            task.run(prompt_request.prompt.clone()).all_text().await
                                        });

                                        rt.block_on(publish_model_status(
                                            model_config.id.clone(),
                                            100.0,
                                            "Ready",
                                            true,
                                            true,
                                        ));

                                        let _ = prompt_request.result_sender.send(Ok(result));
                                    } else {
                                        let _ = prompt_request.result_sender.send(Err(anyhow!(
                                            "Task with ID {} not spawned",
                                            prompt_request.task_id
                                        )));
                                    }
                                }
                            },

                            LLMTaskRequest::Remove(remove_request) => {
                                let _ = tasks.remove(&remove_request.task_id);
                                let _ = task_descriptions.remove(&remove_request.task_id);
                                let _ = remove_request.result_sender.send(());
                            }
                        },
                    }
                }
            }
        });

        Ok(())
    }

    // -------------------------------------
    // Tasks
    // -------------------------------------

    pub fn get_tasks() -> Result<Vec<AITask>> {
        let tasks = Ad4mDb::with_global_instance(|db| db.get_tasks())
            .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;
        Ok(tasks)
    }

    pub async fn add_task(&self, task: AITaskInput) -> Result<AITask> {
        let task_id = Ad4mDb::with_global_instance(|db| {
            db.add_task(
                task.name.clone(),
                task.model_id.clone(),
                task.system_prompt.clone(),
                task.prompt_examples
                    .iter()
                    .map(|p| p.clone().into())
                    .collect(),
                task.meta_data.clone(),
            )
        })
        .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;

        let task = Ad4mDb::with_global_instance(|db| db.get_task(task_id))?
            .expect("to get task that we just created");

        self.spawn_task(task.clone()).await?;
        Ok(task)
    }

    fn replace_model_variables(model_id: &String) -> Result<String> {
        Ok(if model_id == "default" {
            Ad4mDb::with_global_instance(|db| db.get_default_model(ModelType::Llm))?
                .ok_or_else(|| anyhow::anyhow!("Task needs default model but no default set"))?
        } else {
            model_id.clone()
        })
    }

    async fn spawn_task(&self, task: AITask) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        let llm_channel = self.llm_channel.lock().await;
        let model_id = Self::replace_model_variables(&task.model_id)?;

        if let Some(sender) = llm_channel.get(&model_id) {
            sender.send(LLMTaskRequest::Spawn(LLMTaskSpawnRequest {
                task: task.clone(),
                result_sender: tx,
            }))?;
        } else {
            return Err(anyhow::anyhow!(
                "Model '{}' not found in LLM channel",
                task.model_id
            ));
        }

        rx.await?
    }

    pub async fn update_task(&self, task: AITask) -> Result<AITask> {
        let task_id = task.task_id.clone();
        Ad4mDb::with_global_instance(|db| {
            db.update_task(
                task.task_id,
                task.name,
                task.model_id,
                task.system_prompt,
                task.prompt_examples,
                task.meta_data,
            )
        })
        .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;

        self.remove_task(task_id.clone()).await?;

        let updated_task = Ad4mDb::with_global_instance(|db| db.get_task(task_id.clone()))
            .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?
            .ok_or(AIServiceError::TaskNotFound)?;

        self.spawn_task(updated_task.clone()).await?;

        Ok(updated_task)
    }

    pub async fn delete_task(&self, task_id: String) -> Result<bool> {
        self.remove_task(task_id.clone()).await?;
        Ad4mDb::with_global_instance(|db| db.remove_task(task_id))
            .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;
        Ok(true)
    }

    async fn remove_task(&self, task_id: String) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        let llm_channel = self.llm_channel.lock().await;
        let task = Self::get_tasks()?
            .into_iter()
            .find(|t| t.task_id == task_id)
            .ok_or_else(|| anyhow!("Task with ID {} not found", task_id))?;
        let model_id = Self::replace_model_variables(&task.model_id)?;

        if let Some(sender) = llm_channel.get(&model_id) {
            sender.send(LLMTaskRequest::Remove(LLMTaskRemoveRequest {
                task_id,
                result_sender: tx,
            }))?;
        } else {
            return Err(anyhow::anyhow!("Model 'llama' not found in LLM channel"));
        }

        rx.await?;
        Ok(())
    }

    pub async fn prompt(&self, task_id: String, prompt: String) -> Result<String> {
        let (result_sender, rx) = oneshot::channel();

        // Retrieve the task to find the associated model_id
        let task = Ad4mDb::with_global_instance(|db| db.get_task(task_id.clone()))
            .map_err(|e| anyhow::anyhow!("Database error: {}", e))?
            .ok_or_else(|| anyhow::anyhow!("Task not found for task_id: {}", task_id))?;

        let model_id = Self::replace_model_variables(&task.model_id)?;

        let llm_channel = self.llm_channel.lock().await;
        if let Some(sender) = llm_channel.get(&model_id) {
            sender.send(LLMTaskRequest::Prompt(LLMTaskPromptRequest {
                task_id,
                prompt,
                result_sender,
            }))?;
        } else {
            return Err(anyhow::anyhow!(
                "Model '{}' not found in LLM channel",
                model_id
            ));
        }

        rx.await?
    }

    // -------------------------------------
    // Embedding
    // -------------------------------------

    async fn spawn_embedding_model(&self, model_config: crate::types::Model) {
        let (bert_tx, mut bert_rx) = mpsc::unbounded_channel::<EmbeddingRequest>();
        let model_name = model_config.name.clone();
        thread::spawn({
            let model_id = model_config.id.clone();
            move || {
                let rt = tokio::runtime::Runtime::new().unwrap();

                let model = rt
                    .block_on(async {
                        publish_model_status(model_id.clone(), 0.0, "Loading", false, false).await;

                        let bert = Bert::builder()
                            .with_device(Self::new_candle_device())
                            .build_with_loading_handler({
                                let model_id = model_id.clone();
                                move |progress| {
                                    tokio::spawn(handle_progress(model_id.clone(), progress));
                                }
                            })
                            .await;

                        publish_model_status(model_id.clone(), 100.0, "Loaded", true, false).await;

                        bert
                    })
                    .expect("couldn't build Bert model");

                let idle_delay = Duration::from_millis(1);
                loop {
                    match rt.block_on(async {
                        tokio::select! {
                            recv = bert_rx.recv() => Ok(recv),
                            _ = tokio::time::sleep(idle_delay) => Err("timeout"),
                        }
                    }) {
                        Err(_timeout) => std::thread::sleep(idle_delay * 5),
                        Ok(None) => break,
                        Ok(Some(request)) => {
                            let result: Result<Vec<f32>> = rt
                                .block_on(async { model.embed(request.prompt).await })
                                .map(|tensor| tensor.to_vec())
                                .map_err(|bert_error| anyhow!(bert_error));
                            let _ = request.result_sender.send(result);
                        }
                    }
                }
            }
        });

        self.embedding_channel
            .lock()
            .await
            .insert(model_name, bert_tx);
    }

    pub async fn embed(&self, model_id: String, text: String) -> Result<Vec<f32>> {
        let (result_sender, rx) = oneshot::channel();
        let embedding_channel = self.embedding_channel.lock().await;
        if let Some(sender) = embedding_channel.get(&model_id) {
            sender.send(EmbeddingRequest {
                prompt: text,
                result_sender,
            })?;
        } else {
            return Err(anyhow::anyhow!(
                "Model '{}' not found in embedding channel. We have: {}",
                model_id,
                embedding_channel.keys().join(",")
            ));
        }

        rx.await?
    }

    // -------------------------------------
    // Whisper / Transcription
    // -------------------------------------


    fn whisper_string_to_model(whisper_string: String) -> Result<WhisperSource> {
        match whisper_string.as_str() {
            "whisper_tiny" => Ok(WhisperSource::Tiny),
            "whisper_tiny_quantized" => Ok(WhisperSource::QuantizedTiny),
            "whisper_tiny_en" => Ok(WhisperSource::TinyEn),
            "whisper_tiny_en_quantized" => Ok(WhisperSource::QuantizedTinyEn),
            "whisper_base" => Ok(WhisperSource::Base),
            "whisper_base_en" => Ok(WhisperSource::BaseEn),
            "whisper_small" => Ok(WhisperSource::Small),
            "whisper_small_en" => Ok(WhisperSource::SmallEn),
            "whisper_medium" => Ok(WhisperSource::Medium),
            "whisper_medium_en" => Ok(WhisperSource::MediumEn),
            "whisper_medium_en_quantized_distil" => Ok(WhisperSource::QuantizedDistilMediumEn),
            "whisper_large" => Ok(WhisperSource::Large),
            "whisper_large_v2" => Ok(WhisperSource::LargeV2),
            "whisper_distil_medium_en" => Ok(WhisperSource::DistilMediumEn),
            "whisper_distil_large_v2" => Ok(WhisperSource::DistilLargeV2),
            "whisper_distil_large_v3"  => Ok(WhisperSource::DistilLargeV3),
            "whisper_distil_large_v3_quantized" => Ok(WhisperSource::QuantizedDistilLargeV3),
            "whisper_large_v3_turbo_quantized" => Ok(WhisperSource::QuantizedLargeV3Turbo),
            _ => Err(anyhow!("Unknown whisper model: {}", whisper_string))
        }
    }

    fn get_whisper_model_size(model_id: String) -> Result<WhisperSource> {
        // Try to treat string as model size string first
        if let Ok(model) = Self::whisper_string_to_model(model_id.clone()) {
            return Ok(model);
        }

        // Try to get model from DB by ID
        if let Ok(Some(model)) = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone())) {
            if model.model_type != ModelType::Transcription {
                return Err(anyhow!("Model '{}' is not a transcription model", model_id));
            }
            // Use filename from local model config
            if let Some(local) = model.local {
                return Self::whisper_string_to_model(local.file_name);
            }
        }

        // if nothing above works, see if we have a transcription model in the DB and use that
        // Try to find first transcription model in DB
        if let Ok(models) = Ad4mDb::with_global_instance(|db| db.get_models()) {
            if let Some(model) = models.into_iter().find(|m| m.model_type == ModelType::Transcription) {
                if let Some(local) = model.local {
                    return Self::whisper_string_to_model(local.file_name);
                }
            }
        }

        // Default to tiny if nothing found
        Ok(WhisperSource::Tiny)
        
    }


    pub async fn open_transcription_stream(&self, model_id: String) -> Result<String> {
        let model_size = Self::get_whisper_model_size(model_id)?;
        let stream_id = uuid::Uuid::new_v4().to_string();
        let stream_id_clone = stream_id.clone();
        let (samples_tx, samples_rx) = futures_channel::mpsc::unbounded::<Vec<f32>>();
        //TODO: use drop_rx to exit thread
        let (drop_tx, drop_rx) = oneshot::channel();
        let (done_tx, done_rx) = oneshot::channel();

        thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();

            rt.block_on(async {
                let maybe_model = WhisperBuilder::default()
                    .with_source(model_size)
                    .with_device(Self::new_candle_device())
                    .build()
                    .await;

                if let Ok(whisper) = maybe_model {
                    let audio_stream = AudioStream {
                        read_data: Vec::new(),
                        receiver: Box::pin(samples_rx.map(futures_util::stream::iter).flatten()),
                    };

                    let mut word_stream = audio_stream
                        .voice_activity_stream()
                        .rechunk_voice_activity()
                        .with_end_window(Duration::from_millis(500))
                        .transcribe(whisper);

                    let _ = done_tx.send(Ok(()));

                    tokio::select! {
                        _ = drop_rx => {},
                        _ = async {
                            while let Some(segment) = word_stream.next().await {
                                //println!("GOT segment: {}", segment.text());
                                let stream_id_clone = stream_id_clone.clone();

                                rt.spawn(async move {
                                    let _ = get_global_pubsub()
                                        .await
                                        .publish(
                                            &AI_TRANSCRIPTION_TEXT_TOPIC,
                                            &serde_json::to_string(&TranscriptionTextFilter {
                                                stream_id: stream_id_clone.clone(),
                                                text: segment.text().to_string(),
                                            })
                                            .expect("TranscriptionTextFilter must be serializable"),
                                        )
                                        .await;
                                });

                                sleep(Duration::from_millis(50)).await;
                            }
                        } => {}
                    }
                } else {
                    let _ = done_tx.send(Err(maybe_model.err().unwrap()));
                }
            });
        });

        done_rx.await??;

        self.transcription_streams.lock().await.insert(
            stream_id.clone(),
            TranscriptionSession {
                samples_tx,
                drop_tx,
            },
        );

        Ok(stream_id)
    }

    pub async fn feed_transcription_stream(
        &self,
        stream_id: &String,
        audio_samples: Vec<f32>,
    ) -> Result<()> {
        let mut map_lock = self.transcription_streams.lock().await;
        let maybe_stream = map_lock.get_mut(stream_id);
        if let Some(stream) = maybe_stream {
            stream.samples_tx.send(audio_samples).await?;
            Ok(())
        } else {
            Err(AIServiceError::StreamNotFound.into())
        }
    }

    pub async fn close_transcription_stream(&self, stream_id: &String) -> Result<()> {
        let mut map_lock = self.transcription_streams.lock().await;

        if let Some(stream) = map_lock.remove(stream_id) {
            stream.drop_tx.send(()).map_err(|_| {
                anyhow!(AIServiceError::CrazyError(format!(
                    "Failed to close stream {}: Whisper thread may have crashed",
                    stream_id
                )))
            })
        } else {
            Err(AIServiceError::StreamNotFound.into())
        }
    }

    async fn load_transcriber_model(model_id: String) {
        publish_model_status(model_id.clone(), 0.0, "Loading", false, false).await;

        let model_size = Self::get_whisper_model_size(model_id.clone()).ok().unwrap_or(WHISPER_MODEL);

        let _ = WhisperBuilder::default()
            .with_source(model_size)
            .with_device(Self::new_candle_device())
            .build_with_loading_handler({
                let name = model_id.clone();
                move |progress| {
                    tokio::spawn(handle_progress(name.clone(), progress));
                }
            })
            .await;

        publish_model_status(model_id.clone(), 100.0, "Loaded", true, false).await;
    }

    pub async fn update_model(&self, model_id: String, model_config: ModelInput) -> Result<()> {
        log::info!("Updating model: {} with: {:?}", model_id, model_config);
        // First get the existing model to determine its type
        let existing_model = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone()))
            .map_err(|e| anyhow!("Database error: {}", e))?
            .ok_or_else(|| anyhow!("Model not found: {}", model_id))?;

        // Update the model in the database
        Ad4mDb::with_global_instance(|db| db.update_model(&model_id, &model_config))
            .map_err(|e| anyhow!("Failed to update model in database: {}", e))?;

        // Get the updated model from the database
        let updated_model = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone()))
            .map_err(|e| anyhow!("Database error: {}", e))?
            .ok_or_else(|| anyhow!("Model not found after update: {}", model_id))?;

        log::info!("Updated model in DB: {:?}", updated_model);

        match existing_model.model_type {
            ModelType::Llm => {
                // Shutdown the existing model thread
                {
                    let mut llm_channel = self.llm_channel.lock().await;
                    if let Some(sender) = llm_channel.get(&model_id) {
                        log::info!("Shutting down LLM model thread for {}", model_id);
                        let (tx, rx) = oneshot::channel();
                        if let Ok(()) =
                            sender.send(LLMTaskRequest::Shutdown(LLMTaskShutdownRequest {
                                result_sender: tx,
                            }))
                        {
                            // Wait for the thread to confirm shutdown
                            let _ = rx.await;
                            log::info!("LLM model thread for {} confirmed shutdown", model_id);
                        }

                        // Remove the channel from the map
                        llm_channel.remove(&model_id);
                    } else {
                        log::info!(
                            "LLM model thread for {} not found. Nothing to shutdown",
                            model_id
                        );
                    }
                }

                // Spawn the model with new configuration
                log::info!(
                    "Spawning new LLM model thread for {} with updated config",
                    model_id
                );
                let (model_ready_tx, model_ready_rx) = oneshot::channel();
                self.spawn_llm_model(updated_model, Some(model_ready_tx))
                    .await?;
                model_ready_rx.await?;

                // Respawn all tasks for this model
                let tasks = Ad4mDb::with_global_instance(|db| db.get_tasks())
                    .map_err(|e| AIServiceError::DatabaseError(e.to_string()))?;

                for task in tasks.into_iter().filter(|t| t.model_id == model_id) {
                    self.spawn_task(task).await?;
                }
            }
            ModelType::Embedding => {
                // TODO: Handle embedding model updates
            }
            ModelType::Transcription => {
                Self::load_transcriber_model(updated_model.id.clone()).await;
            }
        }

        Ok(())
    }

    pub async fn remove_model(&self, model_id: String) -> Result<()> {
        // First get the existing model to determine its type
        let existing_model = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone()))
            .map_err(|e| anyhow!("Database error: {}", e))?
            .ok_or_else(|| anyhow!("Model not found: {}", model_id))?;

        match existing_model.model_type {
            ModelType::Llm => {
                log::info!("Shutting down LLM model thread for {}", model_id);
                // Shutdown the existing model thread
                let mut llm_channel = self.llm_channel.lock().await;
                if let Some(sender) = llm_channel.get(&model_id) {
                    let (tx, rx) = oneshot::channel();
                    if let Ok(()) = sender.send(LLMTaskRequest::Shutdown(LLMTaskShutdownRequest {
                        result_sender: tx,
                    })) {
                        // Wait for the thread to confirm shutdown
                        let _ = rx.await;
                    }

                    log::info!("LLM model thread for {} confirmed shutdown", model_id);

                    // Remove the channel from the map
                    llm_channel.remove(&model_id);
                } else {
                    log::warn!(
                        "LLM model thread for {} not found. Nothing to shutdown",
                        model_id
                    );
                }
            }
            ModelType::Embedding => {
                // TODO: Handle embedding model removal
            }
            ModelType::Transcription => {
                // TODO: Handle transcription model removal
            }
        }

        // Remove the model from the database
        Ad4mDb::with_global_instance(|db| db.remove_model(&model_id))
            .map_err(|e| anyhow!("Failed to remove model from database: {}", e))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::graphql_types::{AIPromptExamplesInput, LocalModelInput};

    // TODO: We ignore these tests because they need a GPU to not take ages to run
    // BUT: the model lifecycle and update tests show another problem:
    // We can't run them in parallel with each other or other tests because
    // the one global DB gets reseted for each test.
    // -> need to refactor this so that services like AIService or PerspectiveInstance
    // get an DB reference passed in, so we can write proper unit tests.

    #[ignore]
    #[tokio::test]
    async fn test_embedding() {
        Ad4mDb::init_global_instance(":memory:").expect("Ad4mDb to initialize");
        let service = AIService::new().expect("initialization to work");
        let vector = service
            .embed("bert".into(), "Test string".into())
            .await
            .expect("embed to return a result");
        assert!(vector.len() > 300)
    }

    #[ignore]
    #[tokio::test]
    async fn test_prompt() {
        Ad4mDb::init_global_instance(":memory:").expect("Ad4mDb to initialize");
        let service = AIService::new().expect("initialization to work");

        let task = service.add_task(AITaskInput {
                name: "Test task".into(),
                model_id: "llama".into(),
                system_prompt: "You are inside a test for tasks. Please make sure to create any non-zero length output".into(),
                prompt_examples: vec![AIPromptExamplesInput{
                    input: "Test string".into(),
                    output: "Yes, I'm working!".into()
                }],
                meta_data: None
            }).await.expect("add_task to work without error");

        let response = service
            .prompt(task.task_id, "Test string".into())
            .await
            .expect("prompt to return a result");
        println!("Response: {}", response);
        assert!(!response.is_empty())
    }

    #[ignore]
    #[tokio::test]
    async fn test_prompt_stress() {
        Ad4mDb::init_global_instance(":memory:").expect("Ad4mDb to initialize");
        let service = AIService::new().expect("initialization to work");

        let task = service.add_task(AITaskInput {
                name: "Test task".into(),
                model_id: "llama".into(),
                system_prompt: "You are inside a test for tasks. Please make sure to create any non-zero length output".into(),
                meta_data: None,
                prompt_examples: vec![AIPromptExamplesInput{
                    input: "Test string".into(),
                    output: "Yes, I'm working!".into()
                },
                AIPromptExamplesInput{
                    input: "What's up?".into(),
                    output: "Nothing, I'm working!".into()
                },
                AIPromptExamplesInput{
                    input: "Is this a test".into(),
                    output: "Yes, it's working!".into()
                },
                AIPromptExamplesInput{
                    input: "Test string loong".into(),
                    output: "Yes, I'm working! This is a longer response to test the system's ability to handle more extensive outputs. It's important to ensure that the AI can generate and process longer strings of text, as real-world applications often require more detailed and nuanced responses. By including this extended output, we're stress-testing the system's capacity and verifying its robustness in handling varied lengths of text.".into()
                },
                AIPromptExamplesInput{
                    input: "Test string super loong".into(),
                    output: "Yes, I'm working! This is an extremely long response to thoroughly test the system's capacity for handling extensive outputs. In real-world scenarios, AI models often need to generate lengthy and detailed responses to complex queries. This test string is designed to push the limits of our system, ensuring it can process and store large amounts of text without issues. It's crucial to verify that our AI service can maintain coherence and relevance even in prolonged responses. By including various sentence structures, punctuation, and a mix of short and long phrases, we're also testing the linguistic versatility of our model. Furthermore, this extended output allows us to assess the performance impact of processing large text blocks, which is essential for optimizing our system's efficiency. It's worth noting that in practical applications, responses of this length might be common in scenarios such as content generation, detailed explanations, or comprehensive analyses. Therefore, ensuring our system can handle such verbose outputs is paramount for its real-world applicability and robustness.".into()
                }],
        }).await.expect("add_task to work without error");

        let futures = (0..10)
            .map(|_| service.prompt(task.task_id.clone(), "Test string".into()))
            .collect::<Vec<_>>();

        let responses = futures::future::join_all(futures)
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()
            .expect("all prompts to return results");

        let response = responses.join("\n");
        println!("Responses: {}", response);
        assert!(!response.is_empty())
    }

    #[ignore]
    #[tokio::test]
    async fn test_model_lifecycle() {
        Ad4mDb::init_global_instance(":memory:").expect("Ad4mDb to initialize");
        let service = AIService::new().expect("initialization to work");

        // Add a model
        let model_input = ModelInput {
            name: "Test Model".into(),
            model_type: ModelType::Llm,
            local: Some(LocalModelInput {
                file_name: "llama_tiny_1_1b_chat".into(),
                tokenizer_source: None,
                huggingface_repo: None,
                revision: None,
            }),
            api: None,
        };

        let model_id = service
            .add_model(model_input.clone())
            .await
            .expect("model to be added");

        // Update the model
        let updated_model = ModelInput {
            name: "Updated Test Model".into(),
            ..model_input.clone()
        };
        service
            .update_model(model_id.clone(), updated_model)
            .await
            .expect("model to be updated");

        // Verify the update
        let model = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone()))
            .expect("to get model");
        assert_eq!(model.unwrap().name, "Updated Test Model");

        // Remove the model
        service
            .remove_model(model_id.clone())
            .await
            .expect("model to be removed");

        // Verify removal
        let model = Ad4mDb::with_global_instance(|db| db.get_model(model_id.clone()))
            .expect("to get model");
        assert!(model.is_none());
    }

    #[ignore]
    #[tokio::test]
    async fn test_model_update_with_tasks() {
        Ad4mDb::init_global_instance(":memory:").expect("Ad4mDb to initialize");
        let service = AIService::new().expect("initialization to work");

        // Add a model
        let model_input = ModelInput {
            name: "Test Model".into(),
            model_type: ModelType::Llm,
            local: Some(LocalModelInput {
                file_name: "llama_tiny_1_1b_chat".into(),
                tokenizer_source: None,
                huggingface_repo: None,
                revision: None,
            }),
            api: None,
        };

        let model_id = service
            .add_model(model_input.clone())
            .await
            .expect("model to be added");

        // Create a task using this model
        let task = service
            .add_task(AITaskInput {
                name: "Test task".into(),
                model_id: model_id.clone(),
                system_prompt: "Test prompt".into(),
                prompt_examples: vec![],
                meta_data: None,
            })
            .await
            .expect("task to be created");

        // Update the model
        let updated_model = ModelInput {
            name: "Updated Test Model".into(),
            ..model_input.clone()
        };
        service
            .update_model(model_id.clone(), updated_model)
            .await
            .expect("model to be updated");

        // Verify the task still works
        let response = service
            .prompt(task.task_id.clone(), "Test input".into())
            .await
            .expect("prompt to work after model update");
        assert!(!response.is_empty());
    }
}
