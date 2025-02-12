import { useState } from "react";
import "../index.css";

export default function ModelCard(props: {
  model: any;
  editModel: () => void;
  removeModel: () => void;
  setDefaultModel: () => void;
  toggleTask: (modelId: string, taskId: string) => void;
  deleteTask: (modelId: string, taskId: string) => void;
}) {
  const { model, editModel, removeModel, setDefaultModel, toggleTask, deleteTask } = props;
  const {
    id,
    name,
    modelType,
    api,
    local,
    status,
    downloaded,
    loaded,
    progress,
    tasks,
  } = model;

  const [showTasks, setShowTasks] = useState(false);

  function statusText() {
    if (!status) return "Checking status...";
    
    let result = ""
    try {
      

      if (!downloaded) {
        result += `Downloading ${progress?.toFixed(2) || 0}% `
      }

      if (loaded) {
        result += "Loaded! "
      }

      result += `${status}`
      
      return result
    } catch(e){
      alert(e)
      result += `${e}`
    }
    return result
  }

  return (
    <j-box className="box">
      <j-box pb="300">
        <j-flex j="between">
          <j-text variant="heading-sm" size="600" color="primary-800">
            {name}
          </j-text>
          {modelType === "LLM" && (
            <j-flex gap="300">
              {model.default ? (
                <j-button variant="subtle" size="sm" disabled>
                  Default
                </j-button>
              ) : (
                <j-button size="sm" onClick={setDefaultModel}>
                  Set Default
                </j-button>
              )}

              <j-button variant="subtle" size="sm" onClick={editModel}>
                <j-icon name="pencil-square" size="sm" />
              </j-button>

              <j-button variant="subtle" size="sm" onClick={removeModel}>
                <j-icon name="trash" size="sm" />
              </j-button>
            </j-flex>
          )}
          {modelType == "TRANSCRIPTION" && (
            <j-button variant="subtle" size="sm" onClick={editModel}>
              <j-icon name="pencil-square" size="sm" />
            </j-button>
          )}
        </j-flex>
      </j-box>
      <j-flex direction="column" gap="400">
        <j-flex gap="300">
          <j-text nomargin>Type:</j-text>
          <j-text nomargin color="ui-0">
            {modelType === "LLM" ? 
              (api ? "Remote" : "Local")
              : "" 
            } {modelType} 
          </j-text>
        </j-flex>
        <j-flex gap="300">
          <j-text nomargin>Model:</j-text>
          <j-text nomargin color="ui-0">
            {api ? api.model : local.fileName}
          </j-text>
        </j-flex>
        {api && (
          <>
            <j-flex gap="300" wrap>
              <j-text nomargin>API URL:</j-text>
              <j-text
                nomargin
                color="ui-0"
                style={{ maxWidth: "100%", overflowWrap: "break-word" }}
              >
                {api.baseUrl}
              </j-text>
            </j-flex>
          </>
        )}
        {!api && (
          <j-flex gap="300">
            <j-text nomargin>Status:</j-text>
            <j-text nomargin color="ui-0">
              {statusText()}
            </j-text>
          </j-flex>
        )}
        {modelType === "LLM" && (
          <>
            {!tasks || tasks.length === 0 ? (
              <j-text nomargin>No tasks created yet...</j-text>
            ) : (
              <>
                <j-button
                  variant="subtle"
                  onClick={() => setShowTasks(!showTasks)}
                >
                  {showTasks ? "Hide" : "Show"} tasks ( {tasks.length} )
                  <j-icon name={`chevron-${showTasks ? "up" : "down"}`} />
                </j-button>
                {showTasks && (
                  <j-flex gap="300">
                    {tasks.map((task: any) => (
                      <j-box className="box light">
                        <j-flex direction="column" gap="400">
                          <j-text variant="heading-sm" nomargin>
                            {task.name}
                          </j-text>
                          <j-text nomargin>Id: {task.taskId}</j-text>
                          <j-text
                            nomargin
                            style={{
                              overflow: "hidden",
                              maxHeight: task.collapsed ? 60 : "none",
                            }}
                          >
                            {task.systemPrompt}
                          </j-text>
                          <j-button
                            variant="subtle"
                            onClick={() => toggleTask(id, task.taskId)}
                          >
                            Show {task.collapsed ? "more" : "less"}
                            <j-icon
                              name={`chevron-${task.collapsed ? "down" : "up"}`}
                            />
                          </j-button>
                          <j-button
                            variant="subtle"
                            onClick={() => deleteTask(id, task.taskId)}
                          >
                            Delete
                            <j-icon
                              name={"trash"}
                            />
                          </j-button>
                        </j-flex>
                      </j-box>
                    ))}
                  </j-flex>
                )}
              </>
            )}
          </>
        )}
      </j-flex>
    </j-box>
  );
}
