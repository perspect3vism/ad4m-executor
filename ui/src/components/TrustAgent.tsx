import { useContext, useEffect, useState } from "react";
import { Ad4minContext } from "../context/Ad4minContext";

type Props = {
  candidate: string;
  handleTrustAgent: (candidate: string) => void;
};

const TrustAgent = (props: Props) => {
  const {
    state: { client },
  } = useContext(Ad4minContext);

  const [opened, setOpened] = useState(true);

  const addTrustedAgent = async () => {
    let agents = await client!.runtime.addTrustedAgents([props.candidate]);
    // TODO: Show agent trusted notification
    closeModal();
  };

  const closeModal = () => {
    props.handleTrustAgent("");
  };

  return (
    <div>
      {opened && (
        <j-modal
          size="fullscreen"
          open={opened}
          onToggle={(e: any) => setOpened(e.target.open)}
        >
          <j-box p="400">
            <j-flex gap="200" direction="column">
              <j-flex a="center" gap="200">
                <j-text nomargin variant="heading-sm">
                  Trust Agent
                </j-text>
              </j-flex>
              <j-input
                label="Agent DID"
                value={props.candidate}
                disabled
              ></j-input>
              <j-box p="200"></j-box>
              <j-flex>
                <j-button onClick={closeModal}>Close</j-button>
                <j-box p="200"></j-box>
                <j-button onClick={addTrustedAgent}>Trust Agent</j-button>
              </j-flex>
            </j-flex>
          </j-box>
        </j-modal>
      )}
    </div>
  );
};

export default TrustAgent;
